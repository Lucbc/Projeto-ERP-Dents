import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
import { ClinicalRecordsPage } from "../src/pages/clinical-records/clinical-records-page";
import { ProtectedRoute } from "../src/components/layout/protected-route";
import { clinicalRecordService } from "../src/lib/clinical-record-service";
import { patientService } from "../src/lib/services";
import type { Patient, User } from "../src/types";
import type { ClinicalRecord } from "../src/types/clinical-records";

let client: QueryClient;
let clinical: boolean;
let patientAccess: boolean;
let user: User;
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user, isLoading: false }) }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({
  isLoading: false, isError: false, can: (resource: string, action: string) => action === "view" &&
    (resource === "clinical_records" ? clinical : patientAccess),
}) }));
const record: ClinicalRecord = { id: "record", appointment_id: "visit", patient_id: "patient", dentist_id: "dentist",
  author_id: "author", author_name: "Fictitious author", text: "Fictitious original evolution", version: 4,
  created_at: "2026-10-28T12:00:00Z", updated_at: "2026-10-28T14:00:00Z", finalized_at: "2026-10-28T13:00:00Z",
  context: { allergies: "Fictitious historical allergy", medical_history: "Fictitious historical context" },
  addenda: [{ id: "addition", author_id: "author", author_name: "Fictitious author", dentist_id: "dentist",
    text: "Fictitious correction", reason: "Fictitious clarification", recorded_at: "2026-10-28T14:00:00Z" }] };
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 10) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const content = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/patients/patient/clinical-records"]}>
  <Routes><Route path="/patients/:patientId/clinical-records" element={
    <ProtectedRoute permission={{ resource: "clinical_records", action: "view" }}><ClinicalRecordsPage /></ProtectedRoute>
  } /></Routes></MemoryRouter></QueryClientProvider>;
beforeEach(() => {
  vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient(); clinical = true; patientAccess = true;
  user = { id: "reader", role: "reception" } as User;
  vi.spyOn(clinicalRecordService, "list").mockResolvedValue({ items: [record], total: 1 });
  vi.spyOn(patientService, "get").mockResolvedValue({ id: "patient", full_name: "Fictitious patient", birth_date: "2000-02-29",
    allergies: "Fictitious current allergy", medical_history: "Fictitious current context" } as Patient);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.useRealTimers(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });

it("shows original, author, historical context and separate addendum for a non-dentist reader", async () => {
  render(content()); await tick();
  for (const text of [record.text, record.addenda[0].text, "Fictitious historical allergy", "Fictitious current allergy"])
    expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByText(/Nascimento: 29\/02\/2000/)).toBeTruthy();
  expect(screen.getByText("Evolução finalizada")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /Salvar|Finalizar|Excluir/ })).toBeNull();
});

it("clinical permission does not grant access to current cadastral context", async () => {
  patientAccess = false; render(content()); await tick();
  expect(patientService.get).not.toHaveBeenCalled();
  expect(screen.getByText(record.text)).toBeTruthy();
  expect(screen.getByText("Fictitious historical allergy")).toBeTruthy();
  expect(screen.queryByText("Fictitious current allergy")).toBeNull();
});

it("administrator without explicit clinical view never mounts the clinical reader", async () => {
  clinical = false; user = { ...user, role: "admin" }; render(content()); await tick();
  expect(clinicalRecordService.list).not.toHaveBeenCalled(); expect(patientService.get).not.toHaveBeenCalled();
  expect(screen.getByText(/Sem permissão/)).toBeTruthy();
});

it("displays empty drafts distinctly and renders clinical text as text", async () => {
  vi.mocked(clinicalRecordService.list).mockResolvedValue({ items: [{ ...record, finalized_at: null, context: null, text: "", addenda: [] },
    { ...record, id: "unsafe", text: '<img src=x onerror="alert(1)">' }], total: 2 });
  render(content()); await tick();
  expect(screen.getByText("Rascunho — ainda não finalizado")).toBeTruthy();
  expect(screen.getByText("Rascunho sem texto.")).toBeTruthy();
  expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
});

it("paginates without showing the previous page under a new offset", async () => {
  vi.mocked(clinicalRecordService.list).mockImplementation(async (_patient, offset) => ({
    total: 11, items: [{ ...record, text: offset === 0 ? "Fictitious first page" : "Fictitious second page" }],
  }));
  render(content()); await tick(); fireEvent.click(screen.getByRole("button", { name: "Mais evoluções" }));
  expect(screen.queryByText("Fictitious first page")).toBeNull(); await tick();
  expect(screen.getByText("Fictitious second page")).toBeTruthy();
  expect(clinicalRecordService.list).toHaveBeenLastCalledWith("patient", 10, expect.any(AbortSignal));
});

it.each([401, 403])("hides records and clears cached history after HTTP %s", async status => {
  render(content()); await tick();
  vi.mocked(clinicalRecordService.list).mockRejectedValue(failure(status)); await tick(15_010);
  expect(screen.queryByText(record.text)).toBeNull();
  expect(screen.getByText(/Seu acesso ao prontuário foi encerrado/)).toBeTruthy();
  expect(client.getQueriesData({ queryKey: ["clinical-records"] }).filter(([, data]) => data)).toHaveLength(0);
});

it("permission revocation unmounts the reader and removes private query data", async () => {
  const view = render(content()); await tick(); clinical = false; view.rerender(content()); await tick();
  expect(screen.queryByText(record.text)).toBeNull();
  expect(client.getQueriesData({ queryKey: ["clinical-records"] }).filter(([, data]) => data)).toHaveLength(0);
});

it("shows an empty history without implying that missing allergies mean no allergies", async () => {
  vi.mocked(clinicalRecordService.list).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(patientService.get).mockResolvedValue({ id: "patient", full_name: "Fictitious", allergies: null, medical_history: null } as Patient);
  render(content()); await tick();
  expect(screen.getByText("Nenhuma evolução registrada para este paciente.")).toBeTruthy();
  expect(screen.getByText("Não informadas no cadastro.")).toBeTruthy();
});
