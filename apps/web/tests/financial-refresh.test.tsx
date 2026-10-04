import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FinancialPage } from "../src/pages/financial/financial-page";
import { ToastProvider } from "../src/components/ui/toast";
import { appointmentService, dentistService, financialService, patientService } from "../src/lib/services";
import { api } from "../src/lib/api";
import type { Appointment, FinancialEntry, FinancialSummary } from "../src/types";

let canWrite = true;
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: (_resource: string, action = "view") => action === "view" || canWrite }) }));
let client: QueryClient;
const entry = { id: "fictitious", version: 7, entry_type: "income", description: "Fictitious charge", amount_cents: 12000,
  discount_cents: 0, tax_cents: 0, total_cents: 12000, due_date: "2030-01-07", status: "pending", paid_at: null,
  payment_method: null, patient_id: null, dentist_id: null, appointment_id: null, procedure_ids: [], notes: null } as FinancialEntry;
const summary: FinancialSummary = { income_total_cents: 12000, expense_total_cents: 0, received_cents: 0,
  paid_expense_cents: 0, pending_income_cents: 12000, pending_expense_cents: 0, overdue_income_cents: 0,
  balance_cents: 0, entries_count: 1 };
const visit = { id: "11111111-1111-4111-8111-111111111111", status: "scheduled", patient_name: "Fictitious patient",
  dentist_name: "Fictitious dentist", start_at: "2030-01-07T13:00:00Z", end_at: "2030-01-07T14:00:00Z", procedure_ids: [] } as unknown as Appointment;
const failure = (status: number) => new AxiosError("Fictitious error", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "Error", data: { detail: "Fictitious error", code: status === 409 ? "stale_version" : undefined }, headers: {}, config: {} as never });
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
const list = () => within(screen.getByRole("region", { name: "Lançamentos financeiros" }));
const totals = () => within(screen.getByRole("region", { name: "Resumo financeiro" }));
function show() {
  const view = render(<QueryClientProvider client={client}><ToastProvider><FinancialPage /></ToastProvider></QueryClientProvider>);
  return (name: string) => view.container.querySelector(`[name="${name}"]`) as HTMLInputElement;
}
beforeEach(() => {
  canWrite = true;
  vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, 7, 12));
  focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(patientService, "listAll").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(dentistService, "listAll").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(appointmentService, "list").mockResolvedValue([visit]);
  vi.spyOn(financialService, "list").mockResolvedValue({ items: [entry], total: 1 });
  vi.spyOn(financialService, "summary").mockResolvedValue(summary);
  vi.spyOn(financialService, "payments").mockResolvedValue([]);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); sessionStorage.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

it("allows read-only users to open history without exposing payment or reversal actions", async () => {
  canWrite = false; show(); await tick();
  fireEvent.click(list().getByRole("button", { name: "Ver histórico" })); await tick();
  expect(screen.getByRole("heading", { name: "Histórico de pagamentos" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Confirmar baixa integral" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Estornar registro" })).toBeNull();
});

it("clears the entire financial page and its caches when history access is denied", async () => {
  show(); await tick(); fireEvent.click(list().getByRole("button", { name: "Ver histórico" })); await tick();
  vi.mocked(financialService.payments).mockRejectedValue(failure(403));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico de pagamentos" })); await tick();
  expect(screen.getByText(/Seu acesso ao financeiro foi encerrado/)).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Pagamentos e estornos" })).toBeNull();
  expect(client.getQueriesData({ queryKey: ["financial"] })).toEqual([]);
  const reads = vi.mocked(financialService.list).mock.calls.length; await tick(30000);
  expect(financialService.list).toHaveBeenCalledTimes(reads);
});

it("refreshes list and totals without writes or polling form references, and shows the list limit", async () => {
  const create = vi.spyOn(financialService, "create"), update = vi.spyOn(financialService, "update"), pay = vi.spyOn(financialService, "markAsPaid");
  show(); await tick();
  vi.mocked(financialService.list).mockResolvedValue({ items: [{ ...entry, description: "Remote paid", status: "paid", version: 8 }], total: 205 });
  vi.mocked(financialService.summary).mockResolvedValue({ ...summary, received_cents: 12000, entries_count: 205 });
  await tick(15010);
  expect(list().getByText("Remote paid")).toBeTruthy(); expect(list().getByRole("cell", { name: "Pago", exact: true })).toBeTruthy();
  expect(list().getByText(/Exibindo 1 de 205/).textContent).toContain("Limite desta lista: 200");
  expect(totals().getByText(/Lancamentos: 205/)).toBeTruthy();
  expect(financialService.list).toHaveBeenCalledTimes(2); expect(financialService.summary).toHaveBeenCalledTimes(2);
  expect(patientService.listAll).toHaveBeenCalledTimes(1); expect(appointmentService.list).toHaveBeenCalledTimes(1);
  expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(pay).not.toHaveBeenCalled();
});

it("does not turn initial failures into zero balances or an empty list", async () => {
  vi.mocked(financialService.list).mockRejectedValue(failure(503)); vi.mocked(financialService.summary).mockRejectedValue(failure(503));
  show(); await tick();
  expect(totals().queryByText(/R\$/)).toBeNull(); expect(list().queryByText(/Nenhum lancamento/)).toBeNull();
  expect(totals().getByRole("alert").textContent).toContain("Não foi possível carregar");
  expect(list().getByRole("alert").textContent).toContain("Não foi possível carregar");
});

it("keeps stale list and timestamp on transient failure while totals advance, then retries after 60s", async () => {
  show(); await tick(); const stamp = list().getByText(/Última atualização/).textContent;
  vi.mocked(financialService.list).mockRejectedValue(failure(503));
  vi.mocked(financialService.summary).mockResolvedValue({ ...summary, entries_count: 2 }); await tick(15010);
  expect(list().getByText(entry.description)).toBeTruthy(); expect(list().getByText(/Última atualização/).textContent).toBe(stamp);
  expect(list().getByRole("alert").textContent).toContain("desatualizados"); expect(totals().getByText("Lancamentos: 2")).toBeTruthy();
  await tick(30000); expect(financialService.list).toHaveBeenCalledTimes(2);
  vi.mocked(financialService.list).mockResolvedValue({ items: [], total: 0 }); await tick(30000);
  expect(list().getByText(/Nenhum lancamento/)).toBeTruthy(); expect(financialService.list).toHaveBeenCalledTimes(3);
});

it("keeps failed summary values without blocking list updates and allows independent manual recovery", async () => {
  show(); await tick(); vi.mocked(financialService.summary).mockRejectedValue(failure(503));
  vi.mocked(financialService.list).mockResolvedValue({ items: [], total: 0 }); await tick(15010);
  expect(totals().getByText("Lancamentos: 1")).toBeTruthy(); expect(totals().getByRole("alert").textContent).toContain("desatualizados");
  expect(list().getByText(/Nenhum lancamento/)).toBeTruthy();
  const reads = vi.mocked(financialService.list).mock.calls.length;
  vi.mocked(financialService.summary).mockResolvedValue({ ...summary, entries_count: 0 });
  fireEvent.click(totals().getByRole("button", { name: "Atualizar resumo financeiro" })); await tick();
  expect(totals().getByText("Lancamentos: 0")).toBeTruthy(); expect(financialService.list).toHaveBeenCalledTimes(reads);
});

it("cancels obsolete filters, rejects their late response and filters totals only by dates", async () => {
  let resolveOld!: (value: { items: FinancialEntry[]; total: number }) => void;
  vi.mocked(financialService.list).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  show(); await tick(); const oldSignal = vi.mocked(financialService.list).mock.calls[0][1];
  fireEvent.change(screen.getByPlaceholderText("Buscar por descricao, paciente ou dentista"), { target: { value: "new" } });
  vi.mocked(financialService.list).mockResolvedValue({ items: [], total: 0 }); await tick();
  expect(oldSignal?.aborted).toBe(true); expect(financialService.summary).toHaveBeenCalledTimes(1);
  await act(async () => { resolveOld({ items: [{ ...entry, description: "Obsolete response" }], total: 1 }); }); await tick();
  expect(screen.queryByText("Obsolete response")).toBeNull();
  fireEvent.change(screen.getByLabelText("Vencimento inicial"), { target: { value: "2030-01-01" } }); await tick();
  expect(financialService.summary).toHaveBeenLastCalledWith({ from: "2030-01-01", to: undefined }, expect.any(AbortSignal));
  expect(financialService.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "new", from: "2030-01-01", limit: 200 }), expect.any(AbortSignal));
  await tick(15010); expect((screen.getByPlaceholderText("Buscar por descricao, paciente ou dentista") as HTMLInputElement).value).toBe("new");
});

it("does not display totals from the old date range while the new range is unavailable", async () => {
  show(); await tick(); vi.mocked(financialService.summary).mockRejectedValue(failure(503));
  fireEvent.change(screen.getByLabelText("Vencimento final"), { target: { value: "2030-02-01" } }); await tick();
  expect(totals().queryByText(/R\$/)).toBeNull(); expect(totals().queryByText("Lancamentos: 1")).toBeNull();
});

it("pauses hidden/offline reads and refreshes on return without overlapping slow requests", async () => {
  show(); await tick(); act(() => focusManager.setFocused(false)); await tick(30000);
  expect(financialService.list).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(true)); await tick(); expect(financialService.list).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(false)); await tick(30000); expect(financialService.list).toHaveBeenCalledTimes(2);
  vi.mocked(financialService.list).mockImplementation(() => new Promise(() => {}));
  act(() => onlineManager.setOnline(true)); await tick(); expect(financialService.list).toHaveBeenCalledTimes(3);
  await tick(30000); fireEvent(window, new Event("focus")); await tick(); expect(financialService.list).toHaveBeenCalledTimes(3);
});

it("preserves an edited draft and version when the list changes remotely", async () => {
  const update = vi.spyOn(financialService, "update").mockRejectedValue(failure(409)); const field = show(); await tick();
  fireEvent.click(list().getByRole("button", { name: "Editar", exact: true }));
  expect((screen.getByLabelText("Filtrar por status") as HTMLSelectElement).querySelector('option[value="paid"]')).not.toBeNull();
  fireEvent.change(field("amount"), { target: { value: "321.09" } }); fireEvent.change(field("notes"), { target: { value: "Draft" } });
  vi.mocked(financialService.list).mockResolvedValue({ items: [{ ...entry, version: 8, description: "Remote edit" }], total: 1 }); await tick(15010);
  expect(list().getByText("Remote edit")).toBeTruthy(); expect(field("notes").value).toBe("Draft"); expect(field("description").value).toBe(entry.description);
  expect(update).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Salvar", exact: true })); await tick();
  expect(update).toHaveBeenCalledWith(entry.id, expect.objectContaining({ version: 7, amount_cents: 32109, notes: "Draft" }));
  expect(screen.getByRole("button", { name: "Descartar rascunho e carregar atual" })).toBeTruthy();
});

it("keeps a payment attempt's captured version and key through polling and uncertain retry", async () => {
  const pay = vi.spyOn(financialService, "markAsPaid").mockRejectedValue(failure(503)); show(); await tick();
  fireEvent.click(list().getByRole("button", { name: "Baixar", exact: true })); await tick();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar baixa integral" })); await tick();
  const attempt = pay.mock.calls[0]; expect(attempt[1]).toMatchObject({ version: 7, idempotency_key: expect.any(String) });
  vi.mocked(financialService.list).mockResolvedValue({ items: [{ ...entry, version: 8, status: "paid" }], total: 1 }); await tick(15010);
  expect(list().getByRole("cell", { name: "Pago", exact: true })).toBeTruthy(); expect(pay).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Consultar/repetir esta operação" })); await tick();
  expect(pay.mock.calls[1]).toEqual(attempt);
});

it("keeps generation inputs and uncertain attempt while list and summary refresh", async () => {
  const generate = vi.spyOn(financialService, "generateFromAppointment").mockRejectedValue(failure(503)); const field = show(); await tick();
  fireEvent.click(screen.getByRole("button", { name: "Gerar da consulta" }));
  fireEvent.change(field("appointment_id"), { target: { value: visit.id } });
  fireEvent.change(field("notes"), { target: { value: "Generation draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Gerar", exact: true })); await tick();
  expect(generate).toHaveBeenCalledTimes(1); const attempt = generate.mock.calls[0];
  await tick(15010); expect(field("notes").value).toBe("Generation draft"); expect(generate).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /Consultar\/repetir/ })); await tick();
  expect(generate.mock.calls[1]).toEqual(attempt);
});

it.each([['list', 403], ['summary', 403], ['summary', 401]] as const)("discards forms and all financial cache on %s denial (%s)", async (source, status) => {
  const field = show(); await tick(); fireEvent.click(list().getByRole("button", { name: "Editar", exact: true }));
  fireEvent.change(field("notes"), { target: { value: "Sensitive draft" } });
  client.setQueryData(["financial", "payments", entry.id], ["Fictitious cached history"]);
  vi.mocked(financialService[source]).mockRejectedValue(failure(status)); await tick(15010);
  expect(screen.getByText(/Seu acesso ao financeiro foi encerrado/)).toBeTruthy();
  expect(field("notes")).toBeNull(); expect(screen.queryByText(entry.description)).toBeNull();
  expect(client.getQueriesData({ queryKey: ["financial"] })).toEqual([]);
  const reads = vi.mocked(financialService.list).mock.calls.length; await tick(60000); expect(financialService.list).toHaveBeenCalledTimes(reads);
});

it("retains the paid filter for read-only users", async () => {
  canWrite = false; show(); await tick();
  fireEvent.change(screen.getByLabelText("Filtrar por status"), { target: { value: "paid" } }); await tick();
  expect(financialService.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "paid" }), expect.any(AbortSignal));
  expect(screen.queryByRole("button", { name: "Novo lancamento" })).toBeNull();
});

it("cancels the sibling request on revocation and prevents late data from repopulating cache", async () => {
  let resolve!: (value: FinancialSummary) => void;
  vi.mocked(financialService.summary).mockImplementation(() => new Promise(done => { resolve = done; }));
  show(); await tick(); const signal = vi.mocked(financialService.summary).mock.calls[0][1];
  vi.mocked(financialService.list).mockRejectedValue(failure(403)); await tick(15010);
  expect(signal?.aborted).toBe(true);
  await act(async () => { resolve(summary); }); await tick();
  expect(client.getQueriesData({ queryKey: ["financial"] })).toEqual([]);
  expect(screen.queryByText(/Lancamentos: 1/)).toBeNull();
});

it("forwards cancellation to both financial HTTP reads", async () => {
  vi.mocked(financialService.list).mockRestore(); vi.mocked(financialService.summary).mockRestore();
  const get = vi.spyOn(api, "get").mockResolvedValue({ data: {} }); const { signal } = new AbortController();
  await financialService.list({ limit: 200 }, signal); await financialService.summary({ from: "2030-01-01" }, signal);
  expect(get).toHaveBeenCalledWith("/api/financial", { params: { limit: 200 }, signal });
  expect(get).toHaveBeenCalledWith("/api/financial/summary", { params: { from: "2030-01-01" }, signal });
});
