import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { PaymentDialog } from "../src/pages/financial/payment-dialog";
import { financialService } from "../src/lib/services";
import { changeSession } from "../src/lib/session";
import { uncertainFinancialEntry } from "../src/lib/financial-attempt";
import type { FinancialEntry, FinancialOperation } from "../src/types";

vi.mock("@/hooks/use-permissions", () => ({usePermissions: () => ({can: () => true})}));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); sessionStorage.clear(); });
const entry = {id:"fictitious",version:1,entry_type:"income",total_cents:12000,status:"pending",payment_method:null} as FinancialEntry;
const operation = {entry:{...entry,status:"paid",version:2,active_payment_id:"payment"},payment:{id:"payment"},reversal:null,replayed:true} as FinancialOperation;
function setup(value=entry, mode:"pay"|"history"="pay") {
  vi.spyOn(financialService,"payments").mockResolvedValue([]);
  client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const changed=vi.fn();
  render(<QueryClientProvider client={client}><PaymentDialog entry={value} mode={mode} onClose={vi.fn()} onChanged={changed}/></QueryClientProvider>);
  return changed;
}
it("keeps the original key/version/body after a lost payment response",async()=>{
  const pay=vi.spyOn(financialService,"markAsPaid").mockRejectedValueOnce(new AxiosError("network")).mockResolvedValue(operation);
  const changed=setup();
  fireEvent.click(screen.getByRole("button",{name:"Confirmar baixa integral"}));
  fireEvent.click(await screen.findByRole("button",{name:"Consultar/repetir esta operação"}));
  await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
  expect(pay.mock.calls[1]).toEqual(pay.mock.calls[0]);
  expect(pay.mock.calls[0][1]).toMatchObject({version:1,idempotency_key:expect.any(String),paid_at:null});
  expect(screen.getByText(/Operação anterior recuperada/)).toBeTruthy();
  expect(uncertainFinancialEntry(entry.id)).toBe(false);
});
it("blocks new payment after a version conflict and does not retry automatically",async()=>{
  const pay=vi.spyOn(financialService,"markAsPaid").mockRejectedValue(new AxiosError("conflict","ERR_BAD_RESPONSE",undefined,undefined,
    {status:409,data:{detail:"O lançamento mudou.",code:"stale_version"},headers:{},statusText:"Conflict",config:{} as never}));
  setup();fireEvent.click(screen.getByRole("button",{name:"Confirmar baixa integral"}));
  await screen.findByText("O lançamento mudou.");
  expect(screen.queryByRole("button",{name:"Consultar/repetir esta operação"})).toBeNull();
  expect((screen.getByRole("button",{name:"Confirmar baixa integral"}).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  expect(pay).toHaveBeenCalledTimes(1);
});
it("reversal preserves exact payment/version/reason when the response is lost",async()=>{
  const reverse=vi.spyOn(financialService,"reversePayment").mockRejectedValueOnce(new AxiosError("network")).mockResolvedValue({...operation,entry:{...entry,version:3}});
  setup(operation.entry,"history");
  fireEvent.change(screen.getByLabelText("Motivo do estorno"),{target:{value:"Fictitious correction"}});
  fireEvent.click(screen.getByRole("button",{name:"Estornar registro"}));
  fireEvent.click(await screen.findByRole("button",{name:"Consultar/repetir esta operação"}));
  await waitFor(()=>expect(reverse).toHaveBeenCalledTimes(2));
  expect(reverse.mock.calls[1]).toEqual(reverse.mock.calls[0]);
  expect(reverse.mock.calls[0][1]).toMatchObject({version:2,payment_id:"payment",reason:"Fictitious correction"});
});
it("retains only a review marker across remount and clears it on identity change",async()=>{
  changeSession("fictitious-session-a");
  uncertainFinancialEntry(entry.id,true);
  setup();
  expect(screen.queryByRole("button",{name:"Consultar/repetir esta operação"})).toBeNull();
  const review=await screen.findByRole("button",{name:"Conferi o histórico"});
  await waitFor(()=>expect((review as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByRole("button",{name:"Confirmar baixa integral"}).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  changeSession("fictitious-session-b");
  expect(uncertainFinancialEntry(entry.id)).toBe(false);
});
