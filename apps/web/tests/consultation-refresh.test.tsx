import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ConsultationPage } from "../src/pages/consultations/consultation-page";
import { consultationService, permissionService, patientService } from "../src/lib/services";
import type { User, Patient, Appointment, RolePermission, ConsultationPatientDetailResponse, ConsultationPatientListResponse } from "../src/types";

let user: User; let client: QueryClient;
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user }) }));
const patient = { id: "one", full_name: "Fictitious One", phone: "111", version: 1 } as Patient;
const other = { ...patient, id: "two", full_name: "Fictitious Two" };
const visit = { id: "visit", patient_name: "Fictitious One", dentist_name: "Fictitious Dentist", status: "scheduled",
  start_at: "2026-10-03T13:00:00Z", end_at: "2026-10-03T14:00:00Z" } as Appointment;
const detail = (p = patient) => ({ patient: p, next_appointment: visit, upcoming_appointments: [visit] });
const matrix = (view = true) => ({ role: "dentist", version: 1, permissions: { consultations: { view } } } as RolePermission);
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 10) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // Flush reads mounted only after the permission response has rendered.
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
};
const section = (name: string) => within(screen.getByRole("region", { name }));
function show() { return render(<QueryClientProvider client={client}><ConsultationPage /></QueryClientProvider>); }
function open(index = 0) { fireEvent.click(screen.getAllByRole("button", { name: "Abrir", exact: true })[index]); }
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true); client = new QueryClient();
  user = { id: "dentist-user", role: "dentist", dentist_id: "dentist-one" } as User;
  vi.spyOn(permissionService, "me").mockResolvedValue(matrix());
  vi.spyOn(consultationService, "next").mockResolvedValue(visit);
  vi.spyOn(consultationService, "listPatients").mockResolvedValue({ items: [patient, other].map(patient => ({ patient, next_appointment: visit })), total: 2 });
  vi.spyOn(consultationService, "getPatientDetail").mockImplementation(async id => detail(id === "one" ? patient : other));
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

it("loads detail only on selection and preserves search/selection while all reads refresh", async () => {
  const write = vi.spyOn(patientService, "update"); show(); await tick();
  expect(consultationService.getPatientDetail).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Buscar pacientes" }), { target: { value: "Fictitious" } }); await tick(); open(); await tick();
  vi.mocked(consultationService.next).mockResolvedValue({ ...visit, patient_name: "Another next patient" });
  vi.mocked(consultationService.getPatientDetail).mockResolvedValue(detail({ ...patient, phone: "222" }));
  await tick(15_010);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Fictitious");
  expect(section("Dados do paciente").getByText("Telefone: 222")).toBeTruthy();
  expect(section("Próxima consulta").getByText("Another next patient")).toBeTruthy();
  expect(consultationService.getPatientDetail).toHaveBeenLastCalledWith("one", undefined, expect.any(AbortSignal));
  expect(write).not.toHaveBeenCalled();
});

it("distinguishes initial failure from empty results and retains successful sibling sections", async () => {
  vi.mocked(consultationService.next).mockRejectedValue(failure(503)); show(); await tick();
  expect(screen.queryByText("Não há próxima consulta agendada.")).toBeNull(); expect(screen.getAllByRole("button", { name: "Abrir" })).toHaveLength(2);
  vi.mocked(consultationService.next).mockResolvedValue(null);
  fireEvent.click(screen.getByRole("button", { name: "Atualizar próxima consulta" })); await tick();
  expect(screen.getByText("Não há próxima consulta agendada.")).toBeTruthy();
  expect(section("Próxima consulta").getByText(/Última atualização/)).toBeTruthy();
});

it("keeps selected data on transient failure and recovers without replacing selection", async () => {
  show(); await tick(); open(); await tick();
  vi.mocked(consultationService.getPatientDetail).mockRejectedValue(failure(503)); await tick(15_010);
  expect(section("Dados do paciente").getByText("Telefone: 111")).toBeTruthy();
  expect(section("Dados do paciente").getByRole("alert").textContent).toContain("desatualizados");
  vi.mocked(consultationService.getPatientDetail).mockResolvedValue(detail({ ...patient, phone: "333" }));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar dados do paciente" })); await tick();
  expect(section("Dados do paciente").getByText("Telefone: 333")).toBeTruthy();
});

it("hides missing patient data and stops background/focus/reconnect reads until explicit verification", async () => {
  show(); await tick(); open(); await tick();
  vi.mocked(consultationService.getPatientDetail).mockRejectedValue(failure(404)); await tick(15_010);
  expect(section("Dados do paciente").queryByText("Telefone: 111")).toBeNull();
  expect(client.getQueryData(["consultations", "patient-detail", `${user.id}:${user.dentist_id}`, "one"])).toBeUndefined();
  const before = vi.mocked(consultationService.getPatientDetail).mock.calls.length;
  await tick(120_000); act(() => { window.dispatchEvent(new Event("focus")); onlineManager.setOnline(false); }); await tick();
  act(() => onlineManager.setOnline(true)); await tick(); expect(consultationService.getPatientDetail).toHaveBeenCalledTimes(before);
  vi.mocked(consultationService.getPatientDetail).mockRejectedValue(failure(503));
  fireEvent.click(screen.getByRole("button", { name: "Verificar paciente novamente" })); await tick();
  expect(section("Dados do paciente").queryByText("Telefone: 111")).toBeNull(); await tick(120_000);
  expect(consultationService.getPatientDetail).toHaveBeenCalledTimes(before + 1);
  vi.mocked(consultationService.getPatientDetail).mockResolvedValue(detail({ ...patient, phone: "444" }));
  fireEvent.click(screen.getByRole("button", { name: "Verificar paciente novamente" })); await tick();
  expect(section("Dados do paciente").getByText("Telefone: 444")).toBeTruthy();
  expect(consultationService.getPatientDetail).toHaveBeenCalledTimes(before + 2);
  await tick(15_010); expect(consultationService.getPatientDetail).toHaveBeenCalledTimes(before + 3);
});

it.each([401, 403])("blocks all clinical sections after one resource returns %s", async status => {
  show(); await tick(); open(); await tick();
  vi.mocked(consultationService.getPatientDetail).mockRejectedValue(failure(status)); await tick(15_010);
  expect(screen.queryByRole("region", { name: "Pacientes" })).toBeNull(); expect(screen.queryByText("Telefone: 111")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("Sem permissão");
  expect(client.getQueriesData({ queryKey: ["consultations"] })).toHaveLength(0);
  const before = vi.mocked(consultationService.next).mock.calls.length; await tick(60_000);
  expect(consultationService.next).toHaveBeenCalledTimes(before);
});

it("revalidates permission, hides on verification failure, and preserves selection/search through recovery", async () => {
  show(); await tick(); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictitious" } }); await tick(); open(); await tick();
  vi.mocked(permissionService.me).mockRejectedValue(failure(503)); await tick(15_010);
  expect(screen.queryByRole("region", { name: "Pacientes" })).toBeNull();
  vi.mocked(permissionService.me).mockResolvedValue(matrix()); fireEvent.click(screen.getByRole("button", { name: "Atualizar permissões" })); await tick();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Fictitious");
  expect(section("Dados do paciente").getByText("Telefone: 111")).toBeTruthy();
  vi.mocked(permissionService.me).mockResolvedValue(matrix(false)); await tick(15_010);
  expect(screen.queryByRole("region", { name: "Pacientes" })).toBeNull();
});

it("cancels old search and detail requests when choosing another patient", async () => {
  show(); await tick();
  let listSignal!: AbortSignal; let finishList!: (value: ConsultationPatientListResponse) => void;
  vi.mocked(consultationService.listPatients).mockImplementationOnce((_params, signal) => { listSignal = signal!; return new Promise(resolve => { finishList = resolve; }); });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "old" } }); await tick();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "new" } }); await tick(); expect(listSignal.aborted).toBe(true);
  await act(async () => finishList({ items: [], total: 0 })); await tick(); expect(screen.queryByText("Nenhum paciente encontrado.")).toBeNull();
  let detailSignal!: AbortSignal; let finishDetail!: (value: ConsultationPatientDetailResponse) => void;
  vi.mocked(consultationService.getPatientDetail).mockImplementationOnce((_id, _scope, signal) => { detailSignal = signal!; return new Promise(resolve => { finishDetail = resolve; }); });
  open(); await tick(); open(1); await tick(); expect(detailSignal.aborted).toBe(true);
  await act(async () => finishDetail(detail({ ...patient, phone: "OLD" }))); await tick();
  expect(section("Dados do paciente").queryByText("Telefone: OLD")).toBeNull();
  expect(section("Dados do paciente").getByText("Fictitious Two", { exact: true })).toBeTruthy();
});

it("resets state and aborts old reads after a dentist link or identity changes", async () => {
  const view = show(); await tick(); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fictitious" } }); await tick();
  let signal!: AbortSignal;
  vi.mocked(consultationService.getPatientDetail).mockImplementation((_id, _scope, value) => { signal = value!; return new Promise(() => {}); });
  open(); await tick(); user = { ...user, dentist_id: "dentist-two" };
  view.rerender(<QueryClientProvider client={client}><ConsultationPage /></QueryClientProvider>); await tick();
  expect(signal.aborted).toBe(true); expect(screen.queryByRole("region", { name: "Dados do paciente" })).toBeNull();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  user = { ...user, id: "another-user" }; view.rerender(<QueryClientProvider client={client}><ConsultationPage /></QueryClientProvider>); await tick();
  expect(screen.queryByRole("region", { name: "Dados do paciente" })).toBeNull();
});

it("shows truncation explicitly and does not invent missing patients", async () => {
  vi.mocked(consultationService.listPatients).mockResolvedValue({ items: [{ patient, next_appointment: null }], total: 105 });
  show(); await tick(); expect(screen.getByText(/Exibindo 1 de 105 pacientes/)).toBeTruthy();
  expect(screen.getByText(/Refine a busca/)).toBeTruthy();
  expect(consultationService.listPatients).toHaveBeenCalledWith({ search: "", limit: 100, offset: 0 }, expect.any(AbortSignal));
});

it.each(["admin", "unlinked"])("does not read clinical resources for %s", async role => {
  user = role === "admin" ? { ...user, role: "admin" } : { ...user, dentist_id: null }; show(); await tick();
  expect(screen.getByRole("alert")).toBeTruthy(); expect(consultationService.next).not.toHaveBeenCalled();
  expect(consultationService.listPatients).not.toHaveBeenCalled();
});
