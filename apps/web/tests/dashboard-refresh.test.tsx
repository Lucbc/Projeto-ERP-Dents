import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { DashboardPage } from "../src/pages/dashboard-page";
import { appointmentService, dentistService, patientService, permissionService } from "../src/lib/services";
import type { Appointment, RolePermission, User } from "../src/types";

let user: User;
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user }) }));
let client: QueryClient;
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const section = (name: string) => within(screen.getByRole("region", { name }));
const permissions = (denied: string[] = []) => ({ role: "reception", version: 1,
  permissions: Object.fromEntries(["dashboard", "patients", "dentists", "appointments"].map(resource =>
    [resource, { view: !denied.includes(resource), create: false, update: false, delete: false }])) } as RolePermission);
const visit = { id: "visit", patient_name: "Fictitious Patient", dentist_name: "Fictitious Dentist",
  start_at: "2026-10-01T13:00:00Z", end_at: "2026-10-01T14:00:00Z", status: "cancelled" } as Appointment;
function show() { return render(<QueryClientProvider client={client}><DashboardPage /></QueryClientProvider>); }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 1, 12));
  focusManager.setFocused(true); onlineManager.setOnline(true); client = new QueryClient();
  user = { id: "admin-one", role: "admin" } as User;
  vi.spyOn(patientService, "list").mockResolvedValue({ items: [], total: 4 });
  vi.spyOn(dentistService, "list").mockResolvedValue({ items: [], total: 2 });
  vi.spyOn(appointmentService, "list").mockResolvedValue([visit]);
  vi.spyOn(permissionService, "me").mockResolvedValue(permissions());
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

it("refreshes independent totals and includes cancelled appointments without automatic writes", async () => {
  const create = vi.spyOn(patientService, "create"); const update = vi.spyOn(appointmentService, "update");
  show(); await tick();
  expect(section("Pacientes cadastrados").getByText("4")).toBeTruthy();
  expect(section("Consultas de hoje").getByText("Status: Cancelada")).toBeTruthy();
  vi.mocked(patientService.list).mockResolvedValue({ items: [], total: 5 });
  vi.mocked(appointmentService.list).mockResolvedValue([]);
  await tick(15_010);
  expect(section("Pacientes cadastrados").getByText("5")).toBeTruthy();
  expect(section("Consultas de hoje").getByText("0")).toBeTruthy();
  expect(screen.getByText("Nenhuma consulta para hoje.")).toBeTruthy();
  expect(patientService.list).toHaveBeenCalledTimes(2); expect(dentistService.list).toHaveBeenCalledTimes(2);
  expect(permissionService.me).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});

it("keeps successful siblings and timestamps when one resource fails, then recovers manually", async () => {
  show(); await tick(); const stamp = section("Pacientes cadastrados").getByText(/Última atualização/).textContent;
  vi.mocked(patientService.list).mockRejectedValue(failure(503));
  vi.mocked(dentistService.list).mockResolvedValue({ items: [], total: 3 }); await tick(15_010);
  expect(section("Pacientes cadastrados").getByText("4")).toBeTruthy();
  expect(section("Pacientes cadastrados").getByRole("alert").textContent).toContain("desatualizados");
  expect(section("Pacientes cadastrados").getByText(/Última atualização/).textContent).toBe(stamp);
  expect(section("Dentistas cadastrados").getByText("3")).toBeTruthy();
  await tick(30_000); expect(patientService.list).toHaveBeenCalledTimes(2);
  vi.mocked(patientService.list).mockResolvedValue({ items: [], total: 6 });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar pacientes" })); await tick();
  expect(section("Pacientes cadastrados").getByText("6")).toBeTruthy();
});

it("does not label initial failure as zero or an empty agenda", async () => {
  vi.mocked(patientService.list).mockRejectedValue(failure(503)); vi.mocked(appointmentService.list).mockRejectedValue(failure(503));
  show(); await tick();
  expect(section("Pacientes cadastrados").queryByText("0")).toBeNull();
  expect(screen.queryByText("Nenhuma consulta para hoje.")).toBeNull();
  expect(section("Dentistas cadastrados").getByText("2")).toBeTruthy();
});

it.each([401, 403])("hides a denied resource (%s), clears only its query and stops its reads", async status => {
  client.setQueryData(["patients", "unrelated"], "untouched"); show(); await tick();
  vi.mocked(patientService.list).mockRejectedValue(failure(status)); await tick(15_010);
  expect(section("Pacientes cadastrados").queryByText("4")).toBeNull();
  expect(section("Pacientes cadastrados").getByRole("alert").textContent).toContain("Sem permissão");
  expect(client.getQueryData(["patients", "dashboard-count", user.id])).toBeUndefined();
  expect(client.getQueryData(["patients", "unrelated"])).toBe("untouched");
  await tick(60_000); expect(patientService.list).toHaveBeenCalledTimes(2);
  expect(section("Dentistas cadastrados").getByText("2")).toBeTruthy();
});

it("checks route and resource permissions independently and blocks reads when none are allowed", async () => {
  user = { id: "reader", role: "reception" } as User;
  vi.mocked(permissionService.me).mockResolvedValue(permissions(["patients", "dentists", "appointments"]));
  show(); await tick(); await tick();
  expect(screen.getByRole("heading", { name: "Painel" })).toBeTruthy();
  expect(patientService.list).not.toHaveBeenCalled(); expect(dentistService.list).not.toHaveBeenCalled(); expect(appointmentService.list).not.toHaveBeenCalled();
  vi.mocked(permissionService.me).mockResolvedValue(permissions(["dashboard"])); await tick(15_010);
  expect(screen.queryByText("Pacientes cadastrados")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("Sem permissão");
});

it("revokes the page while underlying resources remain allowed, then returns with fresh data", async () => {
  user = { id: "reader", role: "reception" } as User; show(); await tick(); await tick();
  expect(screen.getByText("Fictitious Patient")).toBeTruthy();
  vi.mocked(permissionService.me).mockResolvedValue(permissions(["dashboard"])); await tick(15_010);
  expect(screen.queryByText("Fictitious Patient")).toBeNull();
  const before = vi.mocked(appointmentService.list).mock.calls.length;
  await tick(30_000); expect(appointmentService.list).toHaveBeenCalledTimes(before);
  vi.mocked(permissionService.me).mockResolvedValue(permissions()); vi.mocked(appointmentService.list).mockResolvedValue([]);
  await tick(15_010); await tick();
  expect(screen.queryByText("Fictitious Patient")).toBeNull(); expect(screen.getByText("Nenhuma consulta para hoje.")).toBeTruthy();
});

it("hides indicators while permission verification fails and recovers without unmounting its timer", async () => {
  user = { id: "reader", role: "reception" } as User; show(); await tick(); await tick();
  vi.mocked(permissionService.me).mockRejectedValue(failure(503)); await tick(15_010);
  expect(screen.queryByText("Fictitious Patient")).toBeNull();
  expect(screen.getByText(/indicadores estão ocultos/)).toBeTruthy();
  vi.mocked(permissionService.me).mockResolvedValue(permissions());
  fireEvent.click(screen.getByRole("button", { name: "Atualizar permissões" })); await tick(); await tick();
  expect(screen.getByText("Fictitious Patient")).toBeTruthy();
});

it("pauses hidden/offline reads and avoids overlap of a slow indicator on manual/focus refresh", async () => {
  let done!: (value: { items: []; total: number }) => void;
  vi.mocked(patientService.list).mockImplementation(() => new Promise(resolve => { done = resolve; }));
  show(); await tick(); act(() => window.dispatchEvent(new Event("focus"))); await tick(30_000);
  expect(patientService.list).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("button", { name: "Atualizar pacientes" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => done({ items: [], total: 8 })); await tick();
  act(() => focusManager.setFocused(false)); const before = vi.mocked(dentistService.list).mock.calls.length;
  await tick(30_000); expect(dentistService.list).toHaveBeenCalledTimes(before);
  act(() => onlineManager.setOnline(false)); act(() => focusManager.setFocused(true)); await tick(30_000);
  expect(dentistService.list).toHaveBeenCalledTimes(before);
  act(() => onlineManager.setOnline(true)); await tick(); expect(dentistService.list).toHaveBeenCalledTimes(before + 1);
});

it("switches local day at midnight and ignores an older pending response", async () => {
  vi.setSystemTime(new Date(2026, 9, 1, 23, 59, 59));
  let finish!: (value: Appointment[]) => void; let signal!: AbortSignal;
  vi.mocked(appointmentService.list).mockImplementationOnce((_params, current) => { signal = current!; return new Promise(resolve => { finish = resolve; }); }).mockResolvedValue([]);
  show(); await tick(); const first = vi.mocked(appointmentService.list).mock.calls[0][0]!;
  expect(new Date(first.from!).getHours()).toBe(0); expect(new Date(first.to!).getHours()).toBe(23);
  await tick(1_010); expect(signal.aborted).toBe(true);
  const last = vi.mocked(appointmentService.list).mock.lastCall![0]!;
  expect(new Date(last.from!).getDate()).toBe(2); expect(last.from).not.toBe(first.from);
  await act(async () => finish([visit])); await tick();
  expect(screen.queryByText("Fictitious Patient")).toBeNull(); expect(screen.getByText("Nenhuma consulta para hoje.")).toBeTruthy();
});

it("recomputes the day when returning after suspension and connection recovery", async () => {
  show(); await tick(); act(() => { focusManager.setFocused(false); onlineManager.setOnline(false); });
  vi.setSystemTime(new Date(2026, 9, 3, 9));
  vi.mocked(appointmentService.list).mockResolvedValue([]);
  act(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("online")); }); await tick();
  expect(screen.queryByText("Fictitious Patient")).toBeNull();
  act(() => { onlineManager.setOnline(true); focusManager.setFocused(true); }); await tick();
  expect(new Date(vi.mocked(appointmentService.list).mock.lastCall![0]!.from!).getDate()).toBe(3);
  expect(screen.getByText("Nenhuma consulta para hoje.")).toBeTruthy();
});

it("aborts pending reads on identity change and never shows the prior identity's result", async () => {
  let signal!: AbortSignal; let finish!: (value: Appointment[]) => void;
  vi.mocked(appointmentService.list).mockImplementationOnce((_params, current) => { signal = current!; return new Promise(resolve => { finish = resolve; }); }).mockResolvedValue([]);
  const view = show(); await tick(); user = { id: "admin-two", role: "admin" } as User;
  view.rerender(<QueryClientProvider client={client}><DashboardPage /></QueryClientProvider>); await tick();
  expect(signal.aborted).toBe(true); await act(async () => finish([visit])); await tick();
  expect(screen.queryByText("Fictitious Patient")).toBeNull();
});
