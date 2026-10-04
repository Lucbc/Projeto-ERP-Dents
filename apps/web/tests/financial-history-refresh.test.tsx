import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { PaymentDialog } from "../src/pages/financial/payment-dialog";
import { financialService } from "../src/lib/services";
import { api } from "../src/lib/api";
import type { FinancialEntry, FinancialPayment } from "../src/types";

vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient;
const entry = { id: "fictitious", version: 7, entry_type: "income", total_cents: 12000, status: "pending", payment_method: null } as FinancialEntry;
const payment = { id: "payment-old", entry_id: entry.id, total_cents: 12000, paid_at: "2030-01-07T12:00:00Z",
  recorded_at: "2030-01-07T12:00:00Z", actor_name: "Fictitious author", origin: "recorded", reversal: null } as FinancialPayment;
const reversed = { ...payment, reversal: { recorded_at: "2030-01-07T12:05:00Z", actor_name: "Fictitious author", reason: "Fictitious remote correction" } } as FinancialPayment;
const failure = (status: number) => new AxiosError("Fictitious error", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "Error", data: { detail: "Fictitious conflict" }, headers: {}, config: {} as never });
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
function show(value = entry, mode: "pay" | "history" = "pay") {
  return render(<QueryClientProvider client={client}><PaymentDialog key={value.id} entry={value} mode={mode} onClose={vi.fn()} onChanged={vi.fn()} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, 7, 12)); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(financialService, "payments").mockResolvedValue([]);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); sessionStorage.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

it("shows remote payments while retaining the settlement date, method and captured version", async () => {
  const pay = vi.spyOn(financialService, "markAsPaid").mockRejectedValue(failure(409));
  show(); await tick();
  fireEvent.change(screen.getByLabelText(/Data do pagamento/), { target: { value: "2030-01-07T10:30" } });
  fireEvent.change(document.querySelector("select")!, { target: { value: "pix" } });
  vi.mocked(financialService.payments).mockResolvedValue([payment]); await tick(15010);
  expect(screen.getByText("Pagamento ativo")).toBeTruthy(); expect(screen.getByText("Estado de referência da ação: Pendente.")).toBeTruthy();
  expect(pay).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar baixa integral" })); await tick();
  expect(pay).toHaveBeenCalledWith(entry.id, expect.objectContaining({ version: 7, payment_method: "pix", paid_at: expect.any(String) }));
  expect((screen.getByLabelText(/Data do pagamento/) as HTMLInputElement).value).toBe("2030-01-07T10:30");
  await tick(30010); expect(pay).toHaveBeenCalledTimes(1);
});

it("keeps reversal payment/version/reason even after remote reversal and another payment", async () => {
  const reverse = vi.spyOn(financialService, "reversePayment").mockRejectedValue(failure(409));
  vi.mocked(financialService.payments).mockResolvedValue([payment]);
  show({ ...entry, status: "paid", active_payment_id: payment.id }, "history"); await tick();
  fireEvent.change(screen.getByLabelText("Motivo do estorno"), { target: { value: "Fictitious draft" } });
  vi.mocked(financialService.payments).mockResolvedValue([reversed, { ...payment, id: "payment-new" }]); await tick(15010);
  expect(screen.getByText(/Fictitious remote correction/)).toBeTruthy(); expect(screen.getAllByText("Pagamento ativo")).toHaveLength(1);
  expect(reverse).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Estornar registro" })); await tick();
  expect(reverse).toHaveBeenCalledWith(entry.id, expect.objectContaining({ version: 7, payment_id: "payment-old", reason: "Fictitious draft" }));
  expect(screen.queryByRole("button", { name: "Estornar registro" })).toBeNull();
});

it.each(["settle", "reverse"])("preserves the entire uncertain %s attempt across remote history changes", async kind => {
  const write = kind === "settle" ? vi.spyOn(financialService, "markAsPaid") : vi.spyOn(financialService, "reversePayment");
  write.mockRejectedValue(failure(503));
  show(kind === "settle" ? entry : { ...entry, status: "paid", active_payment_id: payment.id }, kind === "settle" ? "pay" : "history"); await tick();
  if (kind === "reverse") fireEvent.change(screen.getByLabelText("Motivo do estorno"), { target: { value: "Fictitious draft" } });
  fireEvent.click(screen.getByRole("button", { name: kind === "settle" ? "Confirmar baixa integral" : "Estornar registro" })); await tick();
  vi.mocked(financialService.payments).mockResolvedValue([reversed]); await tick(15010);
  expect(screen.getByText(/Fictitious remote correction/)).toBeTruthy(); expect(write).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Consultar/repetir esta operação" })); await tick();
  expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
});

it("retains stale history with timestamp after failure and recovers at 60s", async () => {
  vi.mocked(financialService.payments).mockResolvedValue([payment]); show(); await tick();
  const stamp = screen.getByText(/Última atualização/).textContent;
  vi.mocked(financialService.payments).mockRejectedValue(failure(503)); await tick(15010);
  expect(screen.getByText("Pagamento ativo")).toBeTruthy(); expect(screen.getByText(/Os dados exibidos podem estar desatualizados/)).toBeTruthy();
  expect(screen.getByText(/Última atualização/).textContent).toBe(stamp);
  await tick(30000); expect(financialService.payments).toHaveBeenCalledTimes(2);
  vi.mocked(financialService.payments).mockResolvedValue([reversed]); await tick(30000);
  expect(screen.getByText(/Fictitious remote correction/)).toBeTruthy(); expect(financialService.payments).toHaveBeenCalledTimes(3);
});

it("does not claim an empty history on initial failure and allows manual recovery", async () => {
  vi.mocked(financialService.payments).mockRejectedValue(failure(503)); show(); await tick();
  expect(screen.queryByText("Nenhum pagamento registrado.")).toBeNull(); expect(screen.getByText("Não foi possível carregar histórico de pagamentos.")).toBeTruthy();
  vi.mocked(financialService.payments).mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico de pagamentos" })); await tick();
  expect(screen.getByText("Nenhum pagamento registrado.")).toBeTruthy();
});

it.each([401, 403, 404])("hides history and actions on %s and stops automatic reads", async status => {
  vi.mocked(financialService.payments).mockResolvedValue([payment]); show(); await tick();
  vi.mocked(financialService.payments).mockRejectedValue(failure(status)); await tick(15010);
  expect(screen.queryByText("Pagamento ativo")).toBeNull(); expect(screen.queryByRole("button", { name: "Confirmar baixa integral" })).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain(status === 404 ? "não está mais disponível" : "acesso ao histórico financeiro");
  expect(client.getQueryData(["financial", "payments", entry.id])).toBeUndefined();
  await tick(90000); expect(financialService.payments).toHaveBeenCalledTimes(2);
});

it("cancels closed history, ignores its late response and does not expose it for another selection", async () => {
  let resolve!: (value: FinancialPayment[]) => void;
  vi.mocked(financialService.payments).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = show(); await tick(); const signal = vi.mocked(financialService.payments).mock.calls[0][1];
  view.unmount(); await tick(); expect(signal?.aborted).toBe(true);
  show({ ...entry, id: "another" }); await tick();
  await act(async () => resolve([payment])); await tick();
  expect(screen.queryByText("Pagamento ativo")).toBeNull(); expect(client.getQueryData(["financial", "payments", entry.id])).toBeUndefined();
});

it("pauses hidden/offline history and does not overlap a slow refresh", async () => {
  show(); await tick(); act(() => focusManager.setFocused(false)); await tick(30000); expect(financialService.payments).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(true)); await tick(); expect(financialService.payments).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(false)); await tick(30000); expect(financialService.payments).toHaveBeenCalledTimes(2);
  vi.mocked(financialService.payments).mockImplementation(() => new Promise(() => {})); act(() => onlineManager.setOnline(true)); await tick();
  await tick(30000); fireEvent(window, new Event("focus")); await tick(); expect(financialService.payments).toHaveBeenCalledTimes(3);
});

it("forwards cancellation to the payments HTTP request", async () => {
  vi.mocked(financialService.payments).mockRestore(); const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });
  const controller = new AbortController(); await financialService.payments(entry.id, controller.signal);
  expect(get).toHaveBeenCalledWith(`/api/financial/${entry.id}/payments`, { signal: controller.signal });
});
