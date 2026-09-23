import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { DentistsPage } from "../src/pages/dentists/dentists-page";
import { ToastProvider } from "../src/components/ui/toast";
import { dentistService, specialtyService } from "../src/lib/services";
import type { Dentist } from "../src/types";

vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:()=>true})}));
let client: QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.restoreAllMocks();});
const item={id:"11111111-1111-4111-8111-111111111111",full_name:"Fictitious saved dentist",cro:"FICT-001",
  version:1,active:true,availability:[{day_of_week:"monday",start_time:"08:00",end_time:"18:00"}]} as Dentist;
const failure=(status:number)=>new AxiosError("failure","ERR_BAD_RESPONSE",undefined,undefined,
  {status,statusText:"Error",data:{detail:status===404?"Dentista nao encontrado.":"Cadastro alterado ou vinculado."},headers:{},config:{} as never});
function setup() {
  const list=vi.spyOn(dentistService,"list").mockResolvedValue({items:[item],total:1});
  vi.spyOn(specialtyService,"listAll").mockResolvedValue({items:[],total:0});
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const invalidation=vi.spyOn(client,"invalidateQueries");
  const view=render(<QueryClientProvider client={client}><ToastProvider><DentistsPage/></ToastProvider></QueryClientProvider>);
  return {...view,list,confirm,invalidation};
}

it.each([409,404,503,"network"] as const)("dentist deletion after %s preserves draft and requires successful reload/new confirmation",async(status)=>{
  const remove=vi.spyOn(dentistService,"remove").mockRejectedValueOnce(status==="network"?new Error("offline"):failure(status)).mockResolvedValue();
  const {container,list,confirm,invalidation}=setup();
  fireEvent.click(await screen.findByRole("button",{name:"Editar",exact:true}));
  const name=()=>container.querySelector('[name="full_name"]') as HTMLInputElement;
  fireEvent.change(name(),{target:{value:"Fictitious draft name"}});
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  const reload=await screen.findByRole("button",{name:"Recarregar lista para conferir"});
  expect(remove).toHaveBeenCalledWith(item.id,1);
  expect(confirm.mock.calls[0][0]).toContain(item.full_name);
  expect(confirm.mock.calls[0][0]).toContain(item.cro);
  expect(confirm.mock.calls[0][0]).not.toContain("draft name");
  expect(confirm.mock.calls[0][0]).toContain("Cobranças e pagamentos já registrados permanecem");
  expect(name().value).toBe("Fictitious draft name");
  expect((screen.getByRole("button",{name:"Excluir",exact:true}) as HTMLButtonElement).disabled).toBe(true);
  list.mockRejectedValueOnce(failure(503));fireEvent.click(reload);
  await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(name().value).toBe("Fictitious draft name");expect(remove).toHaveBeenCalledTimes(1);
  list.mockResolvedValue({items:[{...item,version:2,full_name:"Fictitious reviewed dentist"}],total:1});
  fireEvent.click(reload);
  await screen.findByText("Fictitious reviewed dentist",{exact:true});
  await waitFor(()=>expect((screen.getByRole("button",{name:"Excluir",exact:true}) as HTMLButtonElement).disabled).toBe(false));
  expect(name().value).toBe("Fictitious draft name");
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  await waitFor(()=>expect(remove).toHaveBeenLastCalledWith(item.id,2));
  expect(confirm).toHaveBeenCalledTimes(2);
  await waitFor(()=>expect(invalidation).toHaveBeenCalledWith({queryKey:["financial"]}));
  for(const resource of ["dentists","appointments","consultations"])
    expect(invalidation).toHaveBeenCalledWith({queryKey:[resource]});
});

it("canceling dentist confirmation never sends deletion",async()=>{
  const remove=vi.spyOn(dentistService,"remove").mockResolvedValue();
  const {confirm}=setup();confirm.mockReturnValue(false);
  fireEvent.click(await screen.findByRole("button",{name:"Excluir",exact:true}));
  expect(remove).not.toHaveBeenCalled();
});
