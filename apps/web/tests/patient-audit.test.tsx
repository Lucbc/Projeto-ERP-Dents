import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { PatientAuditPage } from "../src/pages/patient-audit/patient-audit-page";
import { patientAuditService, type AuditEvent } from "../src/lib/patient-audit-service";

let allowed = true;
let client: QueryClient;
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => allowed }) }));
const event: AuditEvent = { id: "event", occurred_at: "2026-11-08T12:00:00Z", actor_id: "actor-id",
  action: "patient.updated", patient_id: "deleted-id", before_version: 2,
  after_version: 3, changed_fields: [] };
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tree = () => <QueryClientProvider client={client}><PatientAuditPage /></QueryClientProvider>;
beforeEach(() => {
  allowed = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(patientAuditService, "list").mockResolvedValue({ items: [event], next_cursor: null });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });

it("keeps deleted account identifiers, translated actions and clinic time", async () => {
  render(tree());
  await screen.findByRole("article", { name: "Cadastro de paciente alterado" });
  expect(screen.getByText("Responsável (ID): actor-id")).toBeTruthy();
  expect(screen.getByText("Paciente (ID): deleted-id")).toBeTruthy();
  expect(screen.getByText(/09:00:00/)).toBeTruthy();
  expect(screen.getByText("Salvamento sem alteração de campos.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Próxima página" }) as HTMLButtonElement).disabled).toBe(true);
});

it("paginates by cursor and applying filters starts again at page one", async () => {
  vi.mocked(patientAuditService.list).mockImplementation(async (_, cursor) => ({
    items: [{ ...event, id: cursor ? "older" : "newer", patient_id: cursor ? "older-patient" : "newer-patient" }],
    next_cursor: cursor ? null : "opaque-cursor",
  }));
  render(tree()); await screen.findByRole("article", { name: "Cadastro de paciente alterado" });
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  await screen.findByText("Paciente (ID): older-patient");
  expect(screen.queryByText("Paciente (ID): newer-patient")).toBeNull();
  fireEvent.change(screen.getByLabelText("Ação"), { target: { value: "patient.updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() => expect(patientAuditService.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: "patient.updated" }), null, expect.any(AbortSignal)));
  expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true);
});

it("validates identifiers and clinic intervals before requesting filters", async () => {
  render(tree()); await screen.findByRole("article");
  const calls = vi.mocked(patientAuditService.list).mock.calls.length;
  fireEvent.change(screen.getByLabelText("Responsável (ID)"), { target: { value: "invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(await screen.findByText("Informe um ID válido de responsável ou paciente.")).toBeTruthy();
  expect(patientAuditService.list).toHaveBeenCalledTimes(calls);
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  fireEvent.change(screen.getByLabelText("Desde (São Paulo)"), { target: { value: "2026-11-08T09:00" } });
  fireEvent.change(screen.getByLabelText("Até, sem incluir (São Paulo)"), { target: { value: "2026-11-08T10:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() => expect(patientAuditService.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ since: "2026-11-08T12:00:00.000Z", until: "2026-11-08T13:00:00.000Z" }), null, expect.any(AbortSignal)));
});

it("denies without fetching and clears cached metadata after permission loss", async () => {
  const rendered = render(tree()); await screen.findByRole("article");
  allowed = false; rendered.rerender(tree());
  await screen.findByText("Sem permissão para consultar o histórico de edição de pacientes.");
  expect(screen.queryByRole("article")).toBeNull();
  expect(client.getQueriesData({ queryKey: ["patient-audit"] })).toEqual([]);
  const count = vi.mocked(patientAuditService.list).mock.calls.length;
  rendered.rerender(tree()); expect(patientAuditService.list).toHaveBeenCalledTimes(count);
});

it("distinguishes network error from empty history and clears on HTTP denial", async () => {
  render(tree()); await screen.findByRole("article");
  vi.mocked(patientAuditService.list).mockRejectedValue(failure(503));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico" }));
  await screen.findByText(/Não foi possível atualizar histórico/);
  expect(screen.queryByText("Nenhum evento encontrado para estes filtros.")).toBeNull();
  vi.mocked(patientAuditService.list).mockRejectedValue(failure(403));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico" }));
  await screen.findByText(/Reabra a página após revisar/);
  expect(screen.queryByRole("article")).toBeNull();
  expect(client.getQueriesData({ queryKey: ["patient-audit"] })).toEqual([]);
});

it("shows empty after applying a filter following a recovered network failure", async () => {
  render(tree()); await screen.findByRole("article");
  vi.mocked(patientAuditService.list).mockRejectedValue(failure(503));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico" }));
  await screen.findByText(/Não foi possível atualizar histórico/);
  vi.mocked(patientAuditService.list).mockResolvedValue({ items: [event], next_cursor: null });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico" }));
  await screen.findByText("Atualização automática ativa.");
  vi.mocked(patientAuditService.list).mockResolvedValue({ items: [], next_cursor: null });
  fireEvent.change(screen.getByLabelText("Ação"), { target: { value: "patient.updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await screen.findByText("Nenhum evento encontrado para estes filtros.");
  expect(screen.queryByRole("article")).toBeNull();
});
