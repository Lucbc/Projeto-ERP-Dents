import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { AxiosError } from "axios";
import { ClinicalEditor, type ClinicalTarget } from "../src/pages/clinical-records/clinical-editor";
import { clinicalRecordService, type ClinicalAttempt } from "../src/lib/clinical-record-service";
import { appointmentService } from "../src/lib/services";
import type { Appointment, User } from "../src/types";
import type { ClinicalRecord } from "../src/types/clinical-records";

let client: QueryClient; let user: User; let allowed: boolean; let current: ClinicalRecord;
const refresh = vi.fn(), denied = vi.fn(), close = vi.fn();
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user }) }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: (_resource: string, action: string) => action === "view" || allowed, refresh }) }));
const visit = { id: "visit", patient_id: "patient", dentist_id: "dentist", version: 1, patient_name: "Fictitious patient",
  dentist_name: "Fictitious dentist", start_at: "2030-01-07T13:00:00Z" } as Appointment;
const base: ClinicalRecord = { id: "record", appointment_id: "visit", patient_id: "patient", dentist_id: "dentist",
  author_id: "author", author_name: "Fictitious author", text: "Fictitious saved text", version: 1,
  created_at: "2026-10-28T12:00:00Z", updated_at: "2026-10-28T12:00:00Z", finalized_at: null, context: null, addenda: [] };
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: { detail: "Fictitious controlled conflict", code: "stale_version" }, headers: {}, statusText: "Error", config: {} as never });
function show(target: ClinicalTarget = { kind: "record", id: "record" }) {
  const router = createMemoryRouter([{ path: "/", element: <><Link to="/elsewhere">Outro paciente</Link>
    <ClinicalEditor patientId="patient" target={target} onDenied={denied} onClose={close} /></> },
    { path: "/elsewhere", element: <p>Another page</p> }]);
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { ...view, router };
}
async function loaded() { await waitFor(() => expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).disabled).toBe(false)); }
const change = (value: string) => fireEvent.change(screen.getByLabelText("Evolução clínica"), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  user = { id: "author", role: "dentist", dentist_id: "dentist" } as User; allowed = true; current = structuredClone(base);
  vi.spyOn(appointmentService, "get").mockResolvedValue(visit);
  vi.spyOn(clinicalRecordService, "get").mockImplementation(async () => structuredClone(current));
  vi.spyOn(clinicalRecordService, "forAppointment").mockResolvedValue(null);
  vi.spyOn(clinicalRecordService, "execute").mockImplementation(async attempt => {
    current = { ...current, version: current.version + 1 };
    if (attempt.action === "create" || attempt.action === "save") current.text = attempt.payload.text;
    if (attempt.action === "finalize") current.finalized_at = "2026-10-28T13:00:00Z";
    return structuredClone(current);
  });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it("saves the captured version, finalizes only saved text and registers a separate addendum", async () => {
  show(); await loaded(); change("Fictitious edited text");
  expect((screen.getByRole("button", { name: "Finalizar evolução" }) as HTMLButtonElement).disabled).toBe(true);
  save(); await screen.findByText("Operação confirmada e versão atual conferida.");
  const first = vi.mocked(clinicalRecordService.execute).mock.calls[0][0];
  expect(first).toMatchObject({ action: "save", target: "record", payload: { version: 1, text: "Fictitious edited text" } });
  fireEvent.click(screen.getByRole("button", { name: "Finalizar evolução" }));
  expect(clinicalRecordService.execute).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar finalização" }));
  await screen.findByLabelText("Texto do adendo");
  expect(vi.mocked(clinicalRecordService.execute).mock.calls[1][0]).toMatchObject({ action: "finalize", payload: { version: 2 } });
  expect(vi.mocked(clinicalRecordService.execute).mock.calls[1][0].payload).not.toHaveProperty("text");
  fireEvent.change(screen.getByLabelText("Texto do adendo"), { target: { value: "Fictitious correction" } });
  expect((screen.getByRole("button", { name: "Registrar adendo" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Motivo do adendo"), { target: { value: "Fictitious reason" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar adendo" }));
  await waitFor(() => expect(clinicalRecordService.execute).toHaveBeenCalledTimes(3));
  expect(current.text).toBe("Fictitious edited text");
});

it("unknown result freezes input and retries the exact payload, then reads a newer state", async () => {
  const sent: ClinicalAttempt[] = [];
  vi.mocked(clinicalRecordService.execute).mockImplementation(async attempt => {
    sent.push(structuredClone(attempt));
    if (sent.length === 1) { current = { ...current, text: "Fictitious later edit", version: 3 }; throw failure(503); }
    return { ...base, text: "Fictitious sent text", version: 2 };
  });
  show(); await loaded(); change("Fictitious sent text"); save();
  await screen.findByRole("button", { name: "Recuperar tentativa" });
  expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Fechar atendimento" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Recuperar tentativa" }));
  await screen.findByText(/Há alterações posteriores/);
  expect(sent[1]).toEqual(sent[0]);
  expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).value).toBe("Fictitious later edit");
});

it("conflict preserves local text until explicit reload and never silently retries", async () => {
  vi.mocked(clinicalRecordService.execute).mockRejectedValue(failure(409)); show(); await loaded();
  change("Fictitious unsaved text"); save();
  await screen.findByRole("button", { name: "Descartar texto local e carregar versão atual" });
  expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).value).toBe("Fictitious unsaved text");
  expect((screen.getByRole("button", { name: "Salvar rascunho" }) as HTMLButtonElement).disabled).toBe(true);
  current = { ...base, text: "Fictitious other tab", version: 2 };
  fireEvent.click(screen.getByRole("button", { name: "Descartar texto local e carregar versão atual" }));
  await screen.findByText("Versão atual carregada. Revise antes de salvar.");
  expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).value).toBe(current.text);
  expect(clinicalRecordService.execute).toHaveBeenCalledTimes(1);
});

it("creation binds patient and appointment version and reopens an existing appointment record", async () => {
  show({ kind: "appointment", id: "visit", appointment: visit }); await loaded(); change("Fictitious new draft"); save();
  await waitFor(() => expect(clinicalRecordService.execute).toHaveBeenCalledTimes(1));
  expect(vi.mocked(clinicalRecordService.execute).mock.calls[0][0]).toMatchObject({ action: "create", payload: {
    text: "Fictitious new draft", expected_patient_id: "patient", appointment_version: 1,
  } });
});

it("existing record lookup does not create a duplicate draft", async () => {
  vi.mocked(clinicalRecordService.forAppointment).mockResolvedValue(base);
  show({ kind: "appointment", id: "visit", appointment: visit }); await loaded();
  expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).value).toBe(base.text);
  expect(clinicalRecordService.execute).not.toHaveBeenCalled();
});

it("another author cannot write", async () => {
  user = { ...user, id: "other" }; show(); await screen.findByText(/A escrita exige/);
  expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).disabled).toBe(true);
  save(); expect(clinicalRecordService.execute).not.toHaveBeenCalled();
});

it("blocks navigation with dirty text and allows an explicit discard", async () => {
  show(); await loaded(); change("Fictitious local text"); fireEvent.click(screen.getByRole("link", { name: "Outro paciente" }));
  await screen.findByRole("button", { name: "Continuar no atendimento" });
  expect(screen.queryByText("Another page")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continuar no atendimento" }));
  expect((screen.getByLabelText("Evolução clínica") as HTMLTextAreaElement).value).toBe("Fictitious local text");
  fireEvent.click(screen.getByRole("link", { name: "Outro paciente" }));
  fireEvent.click(await screen.findByRole("button", { name: "Descartar texto e sair" }));
  await screen.findByText("Another page");
});

it("failed current-state read after a confirmed write blocks further writes", async () => {
  show(); await loaded(); change("Fictitious saved");
  vi.mocked(clinicalRecordService.get).mockRejectedValue(failure(503)); save();
  await screen.findByText(/Operação confirmada, mas não foi possível/);
  expect(screen.queryByRole("button", { name: "Recuperar tentativa" })).toBeNull();
  expect((screen.getByRole("button", { name: "Salvar rascunho" }) as HTMLButtonElement).disabled).toBe(true);
});

it("denied recovery retains an unknown attempt instead of creating a new one", async () => {
  vi.mocked(clinicalRecordService.execute).mockRejectedValueOnce(failure(503)).mockRejectedValue(failure(403));
  show(); await loaded(); change("Fictitious unknown"); save();
  fireEvent.click(await screen.findByRole("button", { name: "Recuperar tentativa" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: "Recuperar tentativa" })).toBeTruthy();
  const calls = vi.mocked(clinicalRecordService.execute).mock.calls;
  expect(calls[0][0]).toEqual(calls[1][0]);
});
