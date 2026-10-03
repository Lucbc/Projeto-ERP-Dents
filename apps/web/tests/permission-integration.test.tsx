import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AxiosError } from "axios";
import { EffectivePermissionsProvider } from "../src/hooks/use-effective-permissions";
import { EffectiveAccessGate } from "../src/components/layout/effective-access-gate";
import { ProtectedRoute } from "../src/components/layout/protected-route";
import { usePermissions } from "../src/hooks/use-permissions";
import { PatientsPage } from "../src/pages/patients/patients-page";
import { PaymentDialog } from "../src/pages/financial/payment-dialog";
import { ToastProvider } from "../src/components/ui/toast";
import { financialService, patientService, permissionService } from "../src/lib/services";
import type { FinancialEntry, Patient, PermissionResource, RolePermission, User } from "../src/types";

let client: QueryClient; let user: User;
const revalidateIdentity = vi.fn(async () => {});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user, isLoading: false, logout: vi.fn(), revalidateIdentity }) }));
const patient = { id: "fictitious", full_name: "Fictitious Patient", active: true, version: 7 } as Patient;
const matrix = (view = true, update = true) => ({ role: user.role, version: 1,
  permissions: { patients: { view, create: true, update, delete: true },
    financial: { view, create: true, update, delete: true } } } as RolePermission);
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 10) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
function Menu() { const { can } = usePermissions(); return can("patients", "view") ? <nav>Patient menu</nav> : null; }
function mount(page = <PatientsPage />, resource: PermissionResource = "patients") {
  return render(<QueryClientProvider client={client}><EffectivePermissionsProvider><EffectiveAccessGate>
    <MemoryRouter><ToastProvider><Menu /><ProtectedRoute permission={{ resource, action: "view" }}>
      {page}
    </ProtectedRoute></ToastProvider></MemoryRouter>
  </EffectiveAccessGate></EffectivePermissionsProvider></QueryClientProvider>);
}
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  user = { id: "fictitious-reader", role: "reception" } as User;
  vi.spyOn(permissionService, "me").mockImplementation(async () => matrix());
  vi.spyOn(patientService, "list").mockResolvedValue({ items: [patient], total: 1 });
  vi.spyOn(patientService, "update").mockResolvedValue(patient);
  revalidateIdentity.mockClear();
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });
async function edit(container: HTMLElement) {
  await tick(); fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  const notes = container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
  fireEvent.change(notes, { target: { value: "Fictitious preserved draft" } }); return notes;
}

it("keeps a real form mounted but hidden/inert on failure and restores its draft and version", async () => {
  const { container } = mount(); const notes = await edit(container); notes.focus();
  vi.mocked(permissionService.me).mockRejectedValue(failure(503)); await tick(15_010);
  expect(notes.isConnected).toBe(true); expect(notes.closest('[hidden][inert]')).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("alert"));
  expect(patientService.update).not.toHaveBeenCalled();
  vi.mocked(permissionService.me).mockResolvedValue(matrix());
  fireEvent.click(screen.getByRole("button", { name: "Verificar acesso novamente" })); await tick();
  expect(container.querySelector('textarea[name="notes"]')).toBe(notes);
  expect(notes.value).toBe("Fictitious preserved draft"); expect(notes.closest('[hidden]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await tick();
  expect(patientService.update).toHaveBeenCalledWith(patient.id, expect.objectContaining({ version: 7, notes: "Fictitious preserved draft" }));
});

it("revokes reading in menu and route, clears sensitive state/cache, and grants a fresh page", async () => {
  const { container } = mount(); const notes = await edit(container);
  vi.mocked(permissionService.me).mockResolvedValue(matrix(false)); await tick(15_010);
  expect(notes.isConnected).toBe(false); expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByText(patient.full_name)).toBeNull();
  expect(client.getQueryData(["patients", ""])).toBeUndefined();
  expect(screen.getByText(/Sem permissão para acessar/)).toBeTruthy();
  vi.mocked(permissionService.me).mockResolvedValue(matrix()); await tick(15_010);
  expect(screen.getByRole("navigation")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
  expect(patientService.update).not.toHaveBeenCalled();
});

it("suspends actions on write revocation without discarding a pending attempt or resuming automatically", async () => {
  const { container } = mount(); const notes = await edit(container);
  vi.mocked(permissionService.me).mockResolvedValue(matrix(true, false)); await tick(15_010);
  expect(notes.isConnected).toBe(true); expect(notes.matches(':disabled')).toBe(true); expect(screen.getByText(patient.full_name)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
  expect(screen.getByText(/ações estão suspensas/)).toBeTruthy();
  vi.mocked(permissionService.me).mockResolvedValue(matrix()); await tick(15_010);
  expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
  expect(notes.matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Revisar e retomar ações" }));
  expect(notes.matches(':disabled')).toBe(false); expect(notes.value).toBe("Fictitious preserved draft");
  expect(patientService.update).not.toHaveBeenCalled();
});

it("has one effective read per interval with menu, route and real form consumers", async () => {
  const { container } = mount(); await edit(container); await tick(15_010);
  expect(permissionService.me).toHaveBeenCalledTimes(2);
  expect(patientService.update).not.toHaveBeenCalled();
});

it.each([401, 403])("removes an administrator's open form and resource cache after %s", async status => {
  user = { ...user, role: "admin" }; const { container } = mount(); const notes = await edit(container);
  vi.mocked(permissionService.me).mockRejectedValue(failure(status)); await tick(15_010);
  expect(notes.isConnected).toBe(false); expect(screen.getByText("Acesso não autorizado")).toBeTruthy();
  expect(client.getQueryData(["patients", ""])).toBeUndefined();
  await tick(60_000); expect(permissionService.me).toHaveBeenCalledTimes(2);
});

it("requests identity validation once per mismatched response and never exposes the page", async () => {
  vi.mocked(permissionService.me).mockResolvedValue({ ...matrix(), role: "admin" }); mount(); await tick();
  expect(revalidateIdentity).toHaveBeenCalledTimes(1); expect(patientService.list).not.toHaveBeenCalled();
  expect(screen.getByText(/Seu perfil mudou/)).toBeTruthy();
  await tick(15_010); expect(revalidateIdentity).toHaveBeenCalledTimes(2);
});

it("does not overlap a slow identity validation when permissions keep returning a mismatch", async () => {
  let finish!: () => void;
  revalidateIdentity.mockImplementationOnce(() => new Promise<void>(done => { finish = done; }));
  vi.mocked(permissionService.me).mockResolvedValue({ ...matrix(), role: "admin" }); mount(); await tick();
  await tick(30_010); expect(revalidateIdentity).toHaveBeenCalledTimes(1);
  await act(async () => finish()); await tick(15_010); expect(revalidateIdentity).toHaveBeenCalledTimes(2);
  expect(patientService.list).not.toHaveBeenCalled();
});

it("retains a pending financial idempotency key across write revocation and explicit recovery", async () => {
  const entry = { id: "fictitious-payment", version: 9, total_cents: 100, status: "pending", entry_type: "income" } as FinancialEntry;
  vi.spyOn(financialService, "payments").mockResolvedValue([]);
  let reject!: (error: unknown) => void;
  const pay = vi.spyOn(financialService, "markAsPaid")
    .mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }))
    .mockResolvedValue({ entry: { ...entry, status: "paid", version: 10 }, replayed: true } as never);
  mount(<PaymentDialog entry={entry} mode="pay" onClose={() => {}} onChanged={() => {}} />, "financial"); await tick();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar baixa integral" })); await tick();
  const attempt = pay.mock.calls[0][1];
  vi.mocked(permissionService.me).mockResolvedValue(matrix(true, false)); await tick(15_010);
  await act(async () => reject(failure(503))); await tick();
  expect(pay).toHaveBeenCalledTimes(1);
  vi.mocked(permissionService.me).mockResolvedValue(matrix()); await tick(15_010);
  const recover = screen.getByRole("button", { name: "Consultar/repetir esta operação" });
  expect(recover.matches(':disabled')).toBe(true); expect(pay).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Revisar e retomar ações" }));
  fireEvent.click(recover); await tick();
  expect(pay).toHaveBeenCalledTimes(2); expect(pay.mock.calls[1][1]).toEqual(attempt);
  expect(attempt.version).toBe(9); expect(attempt.idempotency_key).toBeTruthy();
});
