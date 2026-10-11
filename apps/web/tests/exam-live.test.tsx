import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
import { PatientExamsPage } from "../src/pages/patients/patient-exams-page";
import { ReadSuspensionContext } from "../src/hooks/read-suspension";
import { examService, patientService } from "../src/lib/services";
import { ToastProvider } from "../src/components/ui/toast";
import type { Exam, Patient } from "../src/types";

let client: QueryClient, patientAccess: boolean, createAccess: boolean;
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: (resource: string, action: string) =>
  resource === "patients" ? patientAccess : action === "create" ? createAccess : true }) }));
const patient = { id: "fictitious", full_name: "Fictitious original", cpf: "00000000000" } as Patient;
const exam = { id: "fictitious-image", patient_id: patient.id, original_filename: "fictitious.png", mime_type: "image/png", size_bytes: 10, uploaded_at: "2030-01-01T10:00:00Z" } as Exam;
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 10) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true); patientAccess = createAccess = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  vi.spyOn(patientService, "get").mockResolvedValue(patient);
  vi.spyOn(examService, "listByPatient").mockResolvedValue([exam]);
  vi.spyOn(examService, "uploadPolicy").mockResolvedValue({ max_bytes: 1024, extensions: [".png"] });
  vi.spyOn(examService, "upload").mockResolvedValue(exam);
  vi.spyOn(examService, "remove").mockResolvedValue();
  URL.createObjectURL = vi.fn(() => "blob:fictitious"); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });
function tree(suspended = false) { return <QueryClientProvider client={client}><ReadSuspensionContext.Provider value={suspended}>
  <MemoryRouter initialEntries={["/patients/fictitious"]}><ToastProvider><Routes>
    <Route path="/patients/:patientId" element={<PatientExamsPage />} />
  </Routes></ToastProvider></MemoryRouter></ReadSuspensionContext.Provider></QueryClientProvider>; }
function draft(container: HTMLElement) {
  const notes = container.querySelector('input[name="notes"]') as HTMLInputElement;
  const file = container.querySelector('input[type="file"]') as HTMLInputElement;
  const selected = new File(["fictitious"], "draft.png");
  fireEvent.change(notes, { target: { value: "Fictitious preserved notes" } }); fireEvent.change(file, { target: { files: [selected] } });
  return { notes, file, selected };
}
const button = (name: string) => screen.getByRole("button", { name, exact: true }) as HTMLButtonElement;

it("observes remote lists and identity without changing the draft or deletion snapshot; missing target requires review", async () => {
  const view = render(tree()); await tick(); const { notes, file, selected } = draft(view.container);
  fireEvent.click(button("Excluir"));
  vi.mocked(patientService.get).mockResolvedValue({ ...patient, full_name: "Fictitious remote" });
  vi.mocked(examService.listByPatient).mockResolvedValue([exam, { ...exam, id: "second", original_filename: "second.png" }]);
  await tick(15_010); expect(screen.getByRole("cell", { name: "second.png" })).toBeTruthy();
  expect(screen.getByText(/Fictitious remote \(/)).toBeTruthy(); expect(screen.getByText(patient.full_name, { selector: "strong" })).toBeTruthy();
  expect(notes.value).toBe("Fictitious preserved notes"); expect(file.files?.[0]).toBe(selected);
  expect(examService.upload).not.toHaveBeenCalled(); expect(examService.remove).not.toHaveBeenCalled();
  vi.mocked(examService.listByPatient).mockResolvedValue([]); await tick(15_010);
  expect(screen.queryByRole("button", { name: "Confirmar exclusão" })).toBeNull();
  expect(button("Recarregar lista para conferir")).toBeTruthy(); await tick(15_010);
  expect(button("Recarregar lista para conferir")).toBeTruthy(); expect(notes.value).toBe("Fictitious preserved notes");
  expect(examService.uploadPolicy).toHaveBeenCalledTimes(1);
});

it("revokes the current URL and aborts a late preview when its exam disappears", async () => {
  vi.spyOn(examService, "previewImage").mockResolvedValueOnce(new Blob(["fictitious"]));
  render(tree()); await tick(); fireEvent.click(button("Visualizar imagem")); await tick(); expect(screen.getByRole("img")).toBeTruthy();
  vi.mocked(examService.listByPatient).mockResolvedValue([]); await tick(15_010);
  expect(screen.queryByRole("img")).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fictitious");
  vi.mocked(examService.listByPatient).mockResolvedValue([exam]); await tick(15_010);
  let finish!: (blob: Blob) => void; let signal: AbortSignal | undefined;
  vi.mocked(examService.previewImage).mockImplementation((_id, _mime, s) => { signal = s; return new Promise(resolve => { finish = resolve; }); });
  fireEvent.click(button("Visualizar imagem")); vi.mocked(examService.listByPatient).mockResolvedValue([]); await tick(15_010);
  expect(signal?.aborted).toBe(true); await act(async () => finish(new Blob(["late"]))); await tick();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1); expect(screen.queryByRole("img")).toBeNull();
});

it("keeps independent initial/stale failures and recovers after 60 seconds without erasing notes", async () => {
  vi.mocked(examService.listByPatient).mockRejectedValueOnce(failure(503));
  const view = render(tree()); await tick(); expect(screen.getByText("Não foi possível carregar exames.")).toBeTruthy();
  expect(screen.queryByText("Nenhum exame enviado ainda.")).toBeNull(); const { notes } = draft(view.container);
  await tick(30_000); expect(examService.listByPatient).toHaveBeenCalledTimes(1); await tick(30_010);
  expect(screen.getByRole("cell", { name: exam.original_filename })).toBeTruthy();
  vi.mocked(patientService.get).mockRejectedValue(failure(503)); await tick(15_010);
  expect(screen.getByText(/Não foi possível atualizar dados do paciente/)).toBeTruthy(); expect(button("Excluir").disabled).toBe(true);
  expect(screen.getByRole("cell", { name: exam.original_filename })).toBeTruthy(); expect(notes.value).toBe("Fictitious preserved notes");
});

it("header denial removes identity and confirmation but preserves authorized exams and drafts, then grants a fresh identity", async () => {
  const view = render(tree()); await tick(); const { notes, file, selected } = draft(view.container); fireEvent.click(button("Excluir"));
  vi.mocked(patientService.get).mockRejectedValue(failure(403)); await tick(15_010);
  expect(screen.getByText(/Sem acesso aos dados do paciente/)).toBeTruthy(); expect(screen.queryByText(/00000000000/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmar exclusão" })).toBeNull(); expect(button("Excluir").disabled).toBe(true);
  expect(screen.getByRole("cell", { name: exam.original_filename })).toBeTruthy(); expect(file.files?.[0]).toBe(selected);
  patientAccess = false; view.rerender(tree()); await tick();
  patientAccess = true; vi.mocked(patientService.get).mockResolvedValue({ ...patient, full_name: "Fictitious granted" }); view.rerender(tree()); await tick();
  expect(screen.getByText(/Fictitious granted/)).toBeTruthy(); expect(button("Excluir").disabled).toBe(false);
  expect(notes.value).toBe("Fictitious preserved notes"); expect(examService.remove).not.toHaveBeenCalled();
});

it.each([401, 403, 404])("list status %s closes sensitive content and cancels bytes without evicting other patients", async status => {
  let signal: AbortSignal | undefined; let finish!: (blob: Blob) => void;
  vi.spyOn(examService, "previewImage").mockImplementation((_id, _mime, s) => { signal = s; return new Promise(resolve => { finish = resolve; }); });
  client.setQueryData(["exams", "other"], [exam]); client.setQueryData(["permissions", "me", "reader"], { role: "admin" });
  const view = render(tree()); await tick(); draft(view.container); fireEvent.click(button("Visualizar imagem"));
  vi.mocked(examService.listByPatient).mockRejectedValue(failure(status)); await tick(15_010);
  expect(view.container.querySelector('input[name="notes"]')).toBeNull(); expect(signal?.aborted).toBe(true);
  expect(screen.getByText(status === 404 ? /Paciente não encontrado/ : /Seu acesso aos exames/)).toBeTruthy();
  expect(client.getQueryData(["exams", "fictitious"])).toBeUndefined(); expect(client.getQueryData(["exams", "other"])).toEqual([exam]);
  expect(client.getQueryData(["permissions", "me", "reader"])).toEqual({ role: "admin" });
  await act(async () => finish(new Blob(["late"]))); await tick(60_010); expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("global suspension aborts bytes and preserves the upload draft; write loss keeps it mounted and disabled", async () => {
  let signal: AbortSignal | undefined;
  vi.spyOn(examService, "download").mockImplementation((_id, _name, s) => { signal = s; return new Promise(() => {}); });
  const view = render(tree()); await tick(); const { notes, file, selected } = draft(view.container);
  fireEvent.click(button("Baixar")); view.rerender(tree(true)); await tick(); expect(signal?.aborted).toBe(true);
  const reads = vi.mocked(examService.listByPatient).mock.calls.length; await tick(45_000); expect(examService.listByPatient).toHaveBeenCalledTimes(reads);
  view.rerender(tree()); await tick(); expect(notes.value).toBe("Fictitious preserved notes"); expect(file.files?.[0]).toBe(selected);
  createAccess = false; view.rerender(tree()); await tick(); expect(notes.isConnected).toBe(true); expect(notes.matches(':disabled')).toBe(true);
  expect(examService.upload).not.toHaveBeenCalled();
});

it("a missing patient header closes exams instead of displaying generic identity or an empty list", async () => {
  vi.mocked(patientService.get).mockRejectedValue(failure(404)); render(tree()); await tick();
  expect(screen.getByText(/Paciente não encontrado. As ações/)).toBeTruthy();
  expect(screen.queryByText("Nenhum exame enviado ainda.")).toBeNull(); expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();
});

it("file read denial closes the area whereas a missing file revokes its current preview", async () => {
  vi.spyOn(examService, 'previewImage').mockResolvedValue(new Blob(['fictitious']));
  vi.spyOn(examService, 'download').mockRejectedValueOnce(failure(404)).mockRejectedValue(failure(403));
  render(tree()); await tick(); fireEvent.click(button('Visualizar imagem')); await tick();
  fireEvent.click(button('Baixar')); await tick(); expect(screen.queryByRole('img')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fictitious'); expect(button('Enviar')).toBeTruthy();
  fireEvent.click(button('Baixar')); await tick(); expect(screen.getByText(/Seu acesso aos exames/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();
});

it("pauses hidden/offline polling and neither overlaps a slow refresh nor polls the upload policy", async () => {
  render(tree()); await tick(); act(() => focusManager.setFocused(false)); await tick(45_000);
  expect(examService.listByPatient).toHaveBeenCalledTimes(1); act(() => focusManager.setFocused(true)); await tick();
  expect(examService.listByPatient).toHaveBeenCalledTimes(2); act(() => onlineManager.setOnline(false)); await tick(45_000);
  expect(examService.listByPatient).toHaveBeenCalledTimes(2);
  vi.mocked(examService.listByPatient).mockImplementation(() => new Promise(() => {}));
  act(() => onlineManager.setOnline(true)); await tick(); await tick(45_000);
  expect(examService.listByPatient).toHaveBeenCalledTimes(3); expect(button('Atualizar exames').disabled).toBe(true);
  expect(examService.uploadPolicy).toHaveBeenCalledTimes(2); // Its normal reconnect read, without an interval.
});
