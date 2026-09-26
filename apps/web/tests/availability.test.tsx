import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DentistsPage } from "../src/pages/dentists/dentists-page";
import { ToastProvider } from "../src/components/ui/toast";
import { dentistService, specialtyService } from "../src/lib/services";
import type { Dentist } from "../src/types";
vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:()=>true})}));
let client:QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.restoreAllMocks();});

it.each(["25:00","08:60","08:00:30","08:00\n",""])("legacy clock %s remains invalid until explicit correction; draft survives",async start=>{
  const dentist={id:"fictitious",version:1,full_name:"Fictitious legacy dentist",active:true,color:"#0EA5A5",
    availability:[{day_of_week:"monday",start_time:start,end_time:"18:00"}]} as Dentist;
  vi.spyOn(dentistService,"list").mockResolvedValue({items:[dentist],total:1});
  vi.spyOn(specialtyService,"listAll").mockResolvedValue({items:[],total:0});
  const update=vi.spyOn(dentistService,"update").mockResolvedValue({...dentist,version:2});
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const {container}=render(<QueryClientProvider client={client}><ToastProvider><DentistsPage/></ToastProvider></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button",{name:"Editar",exact:true}));
  expect(screen.getByRole("alert").textContent).toContain("horários inválidos");
  const field=(name:string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
  if(start==="08:00:30")expect(field("availability.0.start_time").value).toBe(start);
  fireEvent.change(field("full_name"),{target:{value:"Fictitious reviewed dentist"}});
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText(/Horario inicial invalido/);
  expect(update).not.toHaveBeenCalled();
  expect(field("full_name").value).toBe("Fictitious reviewed dentist");
  fireEvent.change(field("availability.0.start_time"),{target:{value:"08:00"}});
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(1));
  expect(update.mock.calls[0][1]).toMatchObject({version:1,full_name:"Fictitious reviewed dentist",
    availability:[{day_of_week:"monday",start_time:"08:00",end_time:"18:00"}]});
});
