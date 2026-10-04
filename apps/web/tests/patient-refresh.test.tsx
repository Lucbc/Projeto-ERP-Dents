import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AxiosError } from "axios";
import { PatientsPage } from "../src/pages/patients/patients-page";
import { ToastProvider } from "../src/components/ui/toast";
import { patientService } from "../src/lib/services";
import type { Patient } from "../src/types";
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient;
const patient = { id: "fictitious", full_name: "Fictitious patient", active: true, version: 7 } as Patient;
const preview = { id: patient.id, full_name: patient.full_name, version: 7, exam_count: 1, exams_fingerprint: "a".repeat(64) };
const failure = (status: number) => new AxiosError("Fictitious failure", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "Error", data: { detail: "Fictitious conflict" }, headers: {}, config: {} as never });
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
function show() {
  const view = render(<MemoryRouter><QueryClientProvider client={client}><ToastProvider><PatientsPage /></ToastProvider></QueryClientProvider></MemoryRouter>);
  return { ...view, notes: () => view.container.querySelector('[name="notes"]') as HTMLTextAreaElement };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, 7, 12)); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(patientService, "list").mockResolvedValue({ items: [patient], total: 1 });
  vi.spyOn(patientService, "deletionPreview").mockResolvedValue(preview);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

it("updates records and count without writes, preserving search and showing truncation", async () => {
  const create = vi.spyOn(patientService, "create"), remove = vi.spyOn(patientService, "remove"); show(); await tick();
  fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "Fictitious" } }); await tick();
  vi.mocked(patientService.list).mockResolvedValue({ items: [{ ...patient, full_name: "Fictitious remote", version: 8 }], total: 105 }); await tick(15010);
  expect(screen.getByText("Fictitious remote")).toBeTruthy(); expect(screen.getByText(/Exibindo 1 de 105/).textContent).toContain("Limite desta lista: 100");
  expect((screen.getByPlaceholderText(/Buscar por nome/) as HTMLInputElement).value).toBe("Fictitious");
  expect(create).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(patientService.deletionPreview).not.toHaveBeenCalled();
  vi.mocked(patientService.list).mockResolvedValue({ items: [], total: 0 }); await tick(15010); expect(screen.getByText("Nenhum paciente encontrado.")).toBeTruthy();
});

it.each([404, 409])("preserves draft/version after remote changes and blocks saving again after %s until reviewed", async status => {
  const update = vi.spyOn(patientService, "update").mockRejectedValue(failure(status));
  const get = vi.spyOn(patientService, "get").mockResolvedValue({ ...patient, version: 8, notes: "Reviewed remote" });
  const view = show(); await tick(); fireEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));
  fireEvent.change(view.notes(), { target: { value: "Fictitious draft" } });
  vi.mocked(patientService.list).mockResolvedValue({ items: status === 404 ? [] : [{ ...patient, version: 8, notes: "Remote" }], total: status === 404 ? 0 : 1 }); await tick(15010);
  expect(view.notes().value).toBe("Fictitious draft"); expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Salvar", exact: true })); await tick();
  expect(update).toHaveBeenCalledWith(patient.id, expect.objectContaining({ version: 7, notes: "Fictitious draft" }));
  expect((screen.getByRole("button", { name: "Salvar", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(view.container.querySelector("form")!); await tick(); expect(update).toHaveBeenCalledTimes(1);
  if (status === 404) get.mockRejectedValue(failure(404));
  fireEvent.click(screen.getByRole("button", { name: "Descartar rascunho e carregar atual" })); await tick();
  expect(view.notes().value).toBe(status === 404 ? "Fictitious draft" : "Reviewed remote");
});

it("keeps captured preview/fingerprint and does not release deletion review through background refresh", async () => {
  const remove = vi.spyOn(patientService, "remove").mockRejectedValue(failure(409)); show(); await tick();
  fireEvent.click(screen.getByRole("button", { name: "Excluir", exact: true })); await tick();
  vi.mocked(patientService.list).mockResolvedValue({ items: [{ ...patient, version: 8, full_name: "Fictitious remote" }], total: 1 });
  vi.mocked(patientService.deletionPreview).mockResolvedValue({ ...preview, version: 8, exam_count: 2, exams_fingerprint: "b".repeat(64) }); await tick(15010);
  expect(patientService.deletionPreview).toHaveBeenCalledTimes(1); expect(screen.getByText(/1 exame\(s\)/)).toBeTruthy(); expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão", exact: true })); await tick();
  expect(remove).toHaveBeenCalledWith(patient.id, 7, preview.exams_fingerprint);
  await tick(15010); expect(screen.getByRole("button", { name: "Recarregar lista para conferir" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Excluir", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Recarregar lista para conferir" })); await tick();
  fireEvent.click(screen.getByRole("button", { name: "Excluir", exact: true })); await tick();
  expect(patientService.deletionPreview).toHaveBeenLastCalledWith(patient.id, 8); expect(screen.getByText(/2 exame\(s\)/)).toBeTruthy();
});

it("keeps stale rows/timestamp on failure and retries after 60s", async () => {
  show(); await tick(); const stamp = screen.getByText(/Última atualização/).textContent;
  vi.mocked(patientService.list).mockRejectedValue(failure(503)); await tick(15010);
  expect(screen.getByText(patient.full_name)).toBeTruthy(); expect(screen.getByText(/Os dados exibidos podem estar desatualizados/)).toBeTruthy();
  expect(screen.getByText(/Última atualização/).textContent).toBe(stamp);
  await tick(30000); expect(patientService.list).toHaveBeenCalledTimes(2);
  vi.mocked(patientService.list).mockResolvedValue({ items: [], total: 0 }); await tick(30000); expect(screen.getByText("Nenhum paciente encontrado.")).toBeTruthy();
});

it("does not show an empty list on initial failure and permits manual recovery", async () => {
  vi.mocked(patientService.list).mockRejectedValue(failure(503)); show(); await tick(); expect(screen.queryByText("Nenhum paciente encontrado.")).toBeNull();
  expect(screen.getByText("Não foi possível carregar pacientes.")).toBeTruthy();
  vi.mocked(patientService.list).mockResolvedValue({ items: [patient], total: 1 }); fireEvent.click(screen.getByRole("button", { name: "Atualizar pacientes" })); await tick();
  expect(screen.getByText(patient.full_name)).toBeTruthy();
});

it("cancels obsolete search and ignores late response without showing old search results", async () => {
  let resolve!: (value: { items: Patient[]; total: number }) => void;
  vi.mocked(patientService.list).mockImplementationOnce(() => new Promise(done => { resolve = done; })); show(); await tick();
  const signal = vi.mocked(patientService.list).mock.calls[0][1];
  vi.mocked(patientService.list).mockRejectedValue(failure(503)); fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "another" } }); await tick();
  expect(signal?.aborted).toBe(true); await act(async () => resolve({ items: [patient], total: 1 })); await tick();
  expect(screen.queryByText(patient.full_name)).toBeNull(); expect(screen.queryByText("Nenhum paciente encontrado.")).toBeNull();
});

it("pauses hidden/offline reads and avoids overlapping a slow read", async () => {
  show(); await tick(); act(() => focusManager.setFocused(false)); await tick(30000); expect(patientService.list).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(true)); await tick(); expect(patientService.list).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(false)); await tick(30000); expect(patientService.list).toHaveBeenCalledTimes(2);
  vi.mocked(patientService.list).mockImplementation(() => new Promise(() => {})); act(() => onlineManager.setOnline(true)); await tick();
  await tick(30000); fireEvent(window, new Event("focus")); await tick(); expect(patientService.list).toHaveBeenCalledTimes(3);
});

it.each([401, 403])("removes rows, drafts, confirmations and related caches on list %s", async status => {
  const view = show(); await tick(); fireEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));
  fireEvent.change(view.notes(), { target: { value: "Fictitious draft" } }); fireEvent.click(screen.getByRole("button", { name: "Excluir", exact: true })); await tick();
  client.setQueryData(["patient", patient.id], patient); client.setQueryData(["exams", patient.id], []);
  vi.mocked(patientService.list).mockRejectedValue(failure(status)); await tick(15010);
  expect(screen.getByText(/Seu acesso aos pacientes foi encerrado/)).toBeTruthy(); expect(view.notes()).toBeNull(); expect(screen.queryByRole("button", { name: "Confirmar exclusão" })).toBeNull();
  for (const key of ["patients", "patient", "exams"]) expect(client.getQueriesData({ queryKey: [key] })).toEqual([]);
  await tick(30000); expect(patientService.list).toHaveBeenCalledTimes(2);
});
