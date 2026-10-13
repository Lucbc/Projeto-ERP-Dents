import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FinancialPage } from "../src/pages/financial/financial-page";
import { ToastProvider } from "../src/components/ui/toast";
import { ReadSuspensionContext } from "../src/hooks/read-suspension";
import { appointmentService, dentistService, financialService, patientService } from "../src/lib/services";
import type { Appointment, FinancialEntry, FinancialSummary } from "../src/types";

let allowed = true;
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: (resource: string) => resource !== "appointments" || allowed }) }));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); sessionStorage.clear(); allowed = true; });
const visit = { id: "11111111-1111-4111-8111-111111111111", status: "scheduled", patient_name: "Fictitious old", dentist_name: "Fictitious dentist", start_at: "2030-01-07T13:00:00Z" } as Appointment;
const failure = (status: number) => new AxiosError("Fictitious failure", "ERR_BAD_RESPONSE", undefined, undefined, { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
function setup() {
  vi.spyOn(patientService, "listAll").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(dentistService, "listAll").mockResolvedValue({ items: [], total: 0 });
  const appointments = vi.spyOn(appointmentService, "list").mockResolvedValue([visit]);
  vi.spyOn(financialService, "list").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(financialService, "summary").mockResolvedValue({} as FinancialSummary);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = (suspended = false) => <QueryClientProvider client={client}><ReadSuspensionContext.Provider value={suspended}><ToastProvider><FinancialPage /></ToastProvider></ReadSuspensionContext.Provider></QueryClientProvider>;
  const view = render(tree());
  return { ...view, appointments, rerenderPage: (suspended = false) => view.rerender(tree(suspended)), field: (name: string) => view.container.querySelector(`[name="${name}"]`) as HTMLInputElement };
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name, exact: true }));
const ready = () => screen.findByText("Consultas preparadas para geração.");
const open = async () => { click("Gerar da consulta"); await ready(); };

it("reads only on action, freezes options across invalidation and refreshes explicitly without losing draft", async () => {
  const { appointments, field } = setup();
  expect(appointments).not.toHaveBeenCalled(); await open(); expect(appointments).toHaveBeenCalledTimes(1);
  fireEvent.change(field("appointment_id"), { target: { value: visit.id } });
  fireEvent.change(field("notes"), { target: { value: "Fictitious draft" } });
  appointments.mockResolvedValue([{ ...visit, patient_name: "Fictitious new" }]);
  await act(async () => { await client.invalidateQueries({ queryKey: ["appointments"] }); window.dispatchEvent(new Event("focus")); });
  expect(field("appointment_id").textContent).toContain("Fictitious old"); expect(appointments).toHaveBeenCalledTimes(1);
  click("Atualizar consultas para geração"); await ready();
  expect(field("appointment_id").textContent).toContain("Fictitious new"); expect(field("notes").value).toBe("Fictitious draft"); expect(field("appointment_id").value).toBe(visit.id);
  click("Cancelar"); await open(); expect(appointments).toHaveBeenCalledTimes(3); expect(field("notes").value).toBe("");
});

it("preserves missing selection and blocks new generation when a visit is canceled or outside the window", async () => {
  const generate = vi.spyOn(financialService, "generateFromAppointment");
  const { appointments, field } = setup(); await open();
  fireEvent.change(field("appointment_id"), { target: { value: visit.id } });
  appointments.mockResolvedValue([{ ...visit, status: "cancelled" }]); click("Atualizar consultas para geração"); await ready();
  expect(field("appointment_id").value).toBe(visit.id); expect(screen.getByText("Nenhuma consulta disponível nesta janela.")).toBeTruthy();
  click("Gerar"); expect(generate).not.toHaveBeenCalled(); expect((screen.getByRole("button", { name: "Gerar", exact: true }) as HTMLButtonElement).disabled).toBe(true);
});

it("recovers an uncertain generation with identical payload and key even after loss of consultation access", async () => {
  const generate = vi.spyOn(financialService, "generateFromAppointment").mockRejectedValueOnce(failure(503)).mockResolvedValue({} as FinancialEntry);
  const { field, appointments, rerenderPage } = setup(); await open();
  fireEvent.change(field("appointment_id"), { target: { value: visit.id } });
  fireEvent.change(field("notes"), { target: { value: "Original request" } }); click("Gerar");
  await screen.findByRole("button", { name: "Consultar/repetir geração" });
  expect((screen.getByRole("button", { name: "Atualizar consultas para geração" }) as HTMLButtonElement).disabled).toBe(true);
  allowed = false; rerenderPage(); await screen.findByText("Sem acesso às consultas para geração.");
  expect(field("appointment_id").value).toBe(visit.id); expect(appointments).toHaveBeenCalledTimes(1);
  click("Consultar/repetir geração"); await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  expect(generate.mock.calls[1]).toEqual(generate.mock.calls[0]);
  expect(generate.mock.calls[0][1]).toMatchObject({ notes: "Original request", idempotency_key: expect.any(String) });
});

it("recovers failed/denied preparations and requires a fresh read on permission grant", async () => {
  const { appointments, field, rerenderPage } = setup(); appointments.mockRejectedValue(failure(503)); click("Gerar da consulta");
  await screen.findByText("Erro ao preparar consultas para geração. Tente atualizar."); expect(field("notes").matches(":disabled")).toBe(true);
  appointments.mockRejectedValue(failure(403)); click("Atualizar consultas para geração"); await screen.findByText("Sem acesso às consultas para geração.");
  allowed = false; rerenderPage(); appointments.mockResolvedValue([visit]); allowed = true; rerenderPage(); await ready();
  expect(appointments).toHaveBeenCalledTimes(3); expect(field("appointment_id").textContent).toContain("Fictitious old");
});

it("cancels a pending preparation and ignores late results after reopen or unmount", async () => {
  const { appointments, field, unmount } = setup(); let finish!: (items: Appointment[]) => void;
  appointments.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); click("Gerar da consulta");
  await waitFor(() => expect(appointments).toHaveBeenCalledTimes(1)); const signal = appointments.mock.calls[0][1]!;
  click("Cancelar preparação da geração"); expect(signal.aborted).toBe(true); await open();
  await act(async () => finish([{ ...visit, patient_name: "Fictitious late" }])); expect(field("appointment_id").textContent).not.toContain("Fictitious late");
  appointments.mockImplementationOnce(() => new Promise(() => {})); click("Atualizar consultas para geração");
  const lastSignal = appointments.mock.calls.at(-1)![1]!; unmount(); expect(lastSignal.aborted).toBe(true);
});

it("does not duplicate preparation and preserves draft under global read suspension", async () => {
  const { appointments, field, rerenderPage } = setup(); await open(); click("Gerar da consulta"); expect(appointments).toHaveBeenCalledTimes(1);
  fireEvent.change(field("notes"), { target: { value: "Retained" } }); rerenderPage(true); expect(field("notes").matches(":disabled")).toBe(true);
  rerenderPage(); await ready(); expect(field("notes").value).toBe("Retained"); expect(appointments).toHaveBeenCalledTimes(1);
});
