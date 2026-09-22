import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { FinancialPage } from "../src/pages/financial/financial-page";
import { ToastProvider } from "../src/components/ui/toast";
import { financialService, patientService, dentistService } from "../src/lib/services";
import type { FinancialEntry, FinancialSummary } from "../src/types";

vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:(resource:string)=>resource!=="appointments"})}));
let client:QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.restoreAllMocks();});
const entry={id:"fictitious",version:1,entry_type:"income",description:"Fictitious charge",amount_cents:12000,
  discount_cents:0,tax_cents:0,total_cents:12000,due_date:"2030-01-07",status:"pending",paid_at:null,
  payment_method:null,patient_id:null,dentist_id:null,appointment_id:null,procedure_ids:[],notes:null} as FinancialEntry;
const failure=(status:number,code?:string)=>new AxiosError("failure","ERR_BAD_RESPONSE",undefined,undefined,
  {status,statusText:"Error",data:{detail:"Conflito financeiro.",code},headers:{},config:{} as never});
function setup(){
  vi.spyOn(patientService,"listAll").mockResolvedValue({items:[],total:0});
  vi.spyOn(dentistService,"listAll").mockResolvedValue({items:[],total:0});
  vi.spyOn(financialService,"summary").mockResolvedValue({} as FinancialSummary);
  const list=vi.spyOn(financialService,"list").mockResolvedValue({items:[entry],total:1});
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const {container}=render(<QueryClientProvider client={client}><ToastProvider><FinancialPage /></ToastProvider></QueryClientProvider>);
  return {list,field:(name:string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement};
}

it("keeps financial draft after conflict/failed reload and preserves loaded payment timestamp precision",async()=>{
  const paidAt="2030-01-07T12:34:56.123456Z";
  const current={...entry,version:2,status:"paid" as const,paid_at:paidAt,payment_method:"pix" as const,amount_cents:23456,total_cents:23456};
  const update=vi.spyOn(financialService,"update").mockRejectedValueOnce(failure(409,"stale_version")).mockResolvedValue({...current,version:3});
  const get=vi.spyOn(financialService,"get").mockRejectedValueOnce(failure(503)).mockResolvedValue(current);
  const {field}=setup();
  fireEvent.click(await screen.findByRole("button",{name:"Editar",exact:true}));
  fireEvent.change(field("amount"),{target:{value:"321.09"}});
  fireEvent.change(field("notes"),{target:{value:"Draft"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
  const reload=await screen.findByRole("button",{name:"Descartar rascunho e carregar atual"});
  expect(update.mock.calls[0][1]).toMatchObject({version:1,amount_cents:32109,status:"pending",notes:"Draft"});
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(reload);
  await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(field("notes").value).toBe("Draft");
  expect(field("amount").value).toBe("321.09");
  fireEvent.click(reload);
  await waitFor(()=>expect(field("status").value).toBe("paid"));
  expect(field("amount").value).toBe("234.56");
  fireEvent.change(field("notes"),{target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1]).toMatchObject({version:2,paid_at:paidAt,payment_method:"pix",amount_cents:23456,notes:"Reviewed"});
});

it.each(["Baixar","Excluir"])("sends displayed version for %s and requires explicit refresh without automatic retry",async(action)=>{
  vi.spyOn(window,"confirm").mockReturnValue(true);
  const pay=vi.spyOn(financialService,"markAsPaid").mockRejectedValue(failure(409,"stale_version"));
  const remove=vi.spyOn(financialService,"remove").mockRejectedValue(failure(409,"stale_version"));
  const {list}=setup();
  fireEvent.click(await screen.findByRole("button",{name:action,exact:true}));
  const refresh=await screen.findByRole("button",{name:"Recarregar financeiro"});
  if(action==="Baixar") expect(pay).toHaveBeenCalledWith(entry.id,{version:1});
  else expect(remove).toHaveBeenCalledWith(entry.id,1);
  expect((screen.getByRole("button",{name:action,exact:true}) as HTMLButtonElement).disabled).toBe(true);
  list.mockResolvedValue({items:[{...entry,version:2}],total:1});
  fireEvent.click(refresh);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Recarregar financeiro"})).toBeNull());
  expect(financialService.summary).toHaveBeenCalledTimes(2);
  expect(action==="Baixar"?pay:remove).toHaveBeenCalledTimes(1);
});
