import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FinancialPage } from "../src/pages/financial/financial-page";
import { ToastProvider } from "../src/components/ui/toast";
import { ReadSuspensionContext } from "../src/hooks/read-suspension";
import { appointmentService, dentistService, financialService, patientService } from "../src/lib/services";
import { api } from "../src/lib/api";
import { readFinancialAppointments } from "../src/pages/financial/use-financial-references";
import type { FinancialEntry, FinancialSummary } from "../src/types";

let denied = new Set<string>();
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: (resource: string) => !denied.has(resource) }) }));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); sessionStorage.clear(); denied = new Set(); });
const patientId = "11111111-1111-4111-8111-111111111111";
const visitId = "22222222-2222-4222-8222-222222222222";
const entry = { id: "fictional", version: 4, entry_type: "income", description: "Fictitious charge", amount_cents: 12000,
  discount_cents: 0, tax_cents: 0, total_cents: 12000, due_date: "2030-01-07", status: "pending", patient_id: patientId,
  dentist_id: null, appointment_id: visitId, notes: "Original", procedure_ids: [] } as FinancialEntry;
const failure = (status: number, code?: string) => new AxiosError("Fictitious failure", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: { code }, headers: {}, statusText: "Error", config: {} as never });
function setup() {
  const patients = vi.spyOn(patientService, "listAll").mockResolvedValue({ items: [{ id: patientId, full_name: "Fictitious old" }], total: 1 } as never);
  const dentists = vi.spyOn(dentistService, "listAll").mockResolvedValue({ items: [], total: 0 });
  const appointments = vi.spyOn(appointmentService, "list").mockResolvedValue([]);
  const list = vi.spyOn(financialService, "list").mockResolvedValue({ items: [entry], total: 1 });
  vi.spyOn(financialService, "summary").mockResolvedValue({} as FinancialSummary);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15000 }, mutations: { retry: false } } });
  const tree = (suspended = false) => <QueryClientProvider client={client}><ReadSuspensionContext.Provider value={suspended}><ToastProvider><FinancialPage /></ToastProvider></ReadSuspensionContext.Provider></QueryClientProvider>;
  const view = render(tree());
  return { ...view, patients, dentists, appointments, list, rerenderPage: (suspended = false) => view.rerender(tree(suspended)), field: (name: string) => view.container.querySelector(`[name="${name}"]`) as HTMLInputElement };
}
const ready = () => screen.findByText("Referências do lançamento preparadas.");
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name, exact: true }));

it("prepares each action, freezes references through invalidation and preserves draft/version on explicit refresh", async () => {
  const { patients, field } = setup();
  click("Novo lancamento"); await ready();
  expect(patients).toHaveBeenCalledTimes(2);
  fireEvent.change(field("notes"), { target: { value: "Fictitious draft" } });
  patients.mockResolvedValue({ items: [{ id: patientId, full_name: "Fictitious new" }], total: 1 } as never);
  await act(async () => { await client.invalidateQueries({ queryKey: ["patients"] }); window.dispatchEvent(new Event("focus")); });
  expect(field("patient_id").textContent).toContain("Fictitious old");
  expect(patients).toHaveBeenCalledTimes(2);
  click("Atualizar referências do lançamento"); await ready();
  expect(field("patient_id").textContent).toContain("Fictitious new"); expect(field("notes").value).toBe("Fictitious draft");
  click("Cancelar"); click("Novo lancamento"); await ready(); expect(patients).toHaveBeenCalledTimes(4);
});

it("preserves captured IDs outside the window and without optional permissions in the update payload", async () => {
  denied = new Set(["patients", "dentists", "appointments"]);
  const update = vi.spyOn(financialService, "update").mockResolvedValue(entry);
  const { patients, dentists, appointments, field } = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Editar", exact: true })); await ready();
  expect(patients).not.toHaveBeenCalled(); expect(dentists).not.toHaveBeenCalled(); expect(appointments).not.toHaveBeenCalled();
  expect(field("patient_id").value).toBe(patientId); expect(field("appointment_id").value).toBe(visitId);
  fireEvent.change(field("notes"), { target: { value: "Preserved IDs" } }); click("Salvar");
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(update.mock.calls[0][1]).toMatchObject({ version: 4, patient_id: patientId, appointment_id: visitId, notes: "Preserved IDs" });
});

it("blocks partial failure, keeps the draft and supports permission denial then a fresh grant", async () => {
  const { patients, field, rerenderPage } = setup();
  click("Novo lancamento"); await ready(); fireEvent.change(field("notes"), { target: { value: "Retained" } });
  patients.mockRejectedValue(failure(503)); click("Atualizar referências do lançamento");
  await screen.findByText("Falha ao preparar referências do lançamento. Tente atualizar.");
  expect(field("description").matches(":disabled")).toBe(true);
  patients.mockRejectedValue(failure(403)); click("Atualizar referências do lançamento"); await ready();
  expect(screen.getByText("Pacientes: sem acesso ao catálogo; vínculos existentes são mantidos.")).toBeTruthy();
  expect(field("patient_id").textContent).not.toContain("Fictitious old");
  expect(field("notes").value).toBe("Retained");
  denied.add("patients"); rerenderPage();
  patients.mockResolvedValue({ items: [{ id: patientId, full_name: "Fictitious restored" }], total: 1 } as never);
  denied.delete("patients"); rerenderPage(); await ready();
  await waitFor(() => expect(field("patient_id").textContent).toContain("Fictitious restored"));
});

it("cancels preparation and ignores its late response across reopen and unmount", async () => {
  const { patients, field, unmount } = setup();
  await waitFor(() => expect(patients).toHaveBeenCalledTimes(1));
  let finish!: (value: never) => void;
  patients.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  click("Novo lancamento"); await waitFor(() => expect(patients).toHaveBeenCalledTimes(2));
  const signal = patients.mock.calls[1][1]!;
  click("Cancelar preparação"); expect(signal.aborted).toBe(true);
  click("Novo lancamento"); await ready();
  await act(async () => finish({ items: [{ id: patientId, full_name: "Late forbidden" }], total: 1 } as never));
  expect(field("patient_id").textContent).not.toContain("Late forbidden");
  patients.mockImplementationOnce(() => new Promise(() => {})); click("Atualizar referências do lançamento");
  const lastSignal = patients.mock.calls.at(-1)![1]!; unmount(); expect(lastSignal.aborted).toBe(true);
});

it("requires review of a new missing association, preserves optional unlinked creation and honors suspension", async () => {
  const create = vi.spyOn(financialService, "create").mockResolvedValue(entry);
  const { patients, field, rerenderPage } = setup();
  click("Novo lancamento"); await ready();
  fireEvent.change(field("patient_id"), { target: { value: patientId } });
  fireEvent.change(field("description"), { target: { value: "Fictitious new entry" } });
  fireEvent.change(field("amount"), { target: { value: "12" } });
  patients.mockResolvedValue({ items: [], total: 0 }); click("Atualizar referências do lançamento"); await ready();
  expect((screen.getByRole("button", { name: "Salvar", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  expect(field("patient_id").value).toBe(patientId); click("Remover vínculo de paciente");
  rerenderPage(true); expect(field("description").matches(":disabled")).toBe(true);
  rerenderPage(); await ready(); click("Salvar"); await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0][0].patient_id).toBeNull();
});

it("does not reset version conflict on reference refresh and cancels a late explicit record reload", async () => {
  const update = vi.spyOn(financialService, "update").mockRejectedValue(failure(409, "stale_version"));
  let finish!: (value: FinancialEntry) => void;
  const get = vi.spyOn(financialService, "get").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { field, unmount, patients } = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Editar", exact: true })); await ready();
  fireEvent.change(field("notes"), { target: { value: "Draft" } }); click("Salvar");
  await screen.findByRole("button", { name: "Descartar rascunho e carregar atual" });
  click("Atualizar referências do lançamento"); await ready();
  expect(update.mock.calls[0][1].version).toBe(4); expect(field("notes").value).toBe("Draft");
  expect((screen.getByRole("button", { name: "Salvar", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  click("Descartar rascunho e carregar atual"); await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  const count = patients.mock.calls.length; unmount(); expect(get.mock.calls[0][1]!.aborted).toBe(true);
  await act(async () => finish({ ...entry, version: 5 })); expect(patients).toHaveBeenCalledTimes(count);
});

it("passes the cancellation signal to the financial record transport", async () => {
  const get = vi.spyOn(api, "get").mockResolvedValue({ data: entry });
  const controller = new AbortController(); await financialService.get(entry.id, controller.signal);
  expect(get).toHaveBeenCalledWith(`/api/financial/${entry.id}`, { signal: controller.signal });
});

it("renews the consultation window for each explicit read and passes its signal", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2030-01-15T12:00:00Z"));
    const list = vi.spyOn(appointmentService, "list").mockResolvedValue([{ id: visitId, status: "cancelled" }] as never);
    const controller = new AbortController();
    expect((await readFinancialAppointments(controller.signal)).items).toEqual([]);
    const first = list.mock.calls[0][0];
    vi.setSystemTime(new Date("2030-02-15T12:00:00Z")); await readFinancialAppointments(controller.signal);
    expect(list.mock.calls[1][0]).not.toEqual(first);
    expect(list.mock.calls[1][1]).toBe(controller.signal);
  } finally { vi.useRealTimers(); }
});

it("keeps filter identity while refreshing its independent options and never replaces open form options", async () => {
  const { patients, list, container, field } = setup();
  const filter = container.querySelector('select[aria-label="Filtrar por paciente"]')!;
  await waitFor(() => expect(filter.textContent).toContain("Fictitious old"));
  fireEvent.change(filter, { target: { value: patientId } });
  click("Novo lancamento"); await ready();
  expect((screen.getByRole("button", { name: "Atualizar opções dos filtros" }) as HTMLButtonElement).disabled).toBe(true);
  patients.mockResolvedValue({ items: [], total: 0 }); click("Atualizar referências do lançamento"); await ready();
  expect(filter.textContent).toContain("Fictitious old"); expect(field("patient_id").textContent).not.toContain("Fictitious old");
  click("Cancelar"); click("Atualizar opções dos filtros");
  await waitFor(() => expect(filter.textContent).toContain("Paciente indisponível"));
  expect((filter as HTMLSelectElement).value).toBe(patientId);
  expect(list.mock.calls.at(-1)![0]?.patient_id).toBe(patientId);
});
