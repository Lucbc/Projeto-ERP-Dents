import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { DentistsPage } from "../src/pages/dentists/dentists-page";
import { ToastProvider } from "../src/components/ui/toast";
import { dentistService, specialtyService } from "../src/lib/services";
import type { Dentist, Specialty } from "../src/types";

vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it("keeps specialty and schedule drafts after conflict or failed reload, then saves the explicitly loaded version", async () => {
  const slots = (start: string) => [{day_of_week:"monday" as const,start_time:start,end_time:"18:00"}];
  const dentist = {id:"fictitious",full_name:"Fictitious Dentist",active:true,version:1,
    color:"#0EA5A5",specialty:"Original",availability:slots("08:00")} as Dentist;
  vi.spyOn(dentistService,"list").mockResolvedValue({items:[dentist],total:1});
  vi.spyOn(specialtyService,"listAll").mockResolvedValue({items:
    ["Original","Draft","Current"].map((name) => ({id:name,name}) as Specialty),total:3});
  const failure = (status: number) => new AxiosError("failure", "ERR_BAD_RESPONSE", undefined, undefined,
    {status,statusText:"Error",data:{detail:"Conflito de edição."},headers:{},config:{} as never});
  const update = vi.spyOn(dentistService,"update").mockRejectedValueOnce(failure(409))
    .mockResolvedValue({...dentist,version:3});
  const get = vi.spyOn(dentistService,"get").mockRejectedValueOnce(failure(503))
    .mockResolvedValue({...dentist,version:2,specialty:"Current",availability:slots("09:00")});
  client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const {container}=render(<QueryClientProvider client={client}><ToastProvider><DentistsPage /></ToastProvider></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button",{name:"Editar"}));
  const field=(name: string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
  fireEvent.change(field("specialty"),{target:{value:"Draft"}});
  fireEvent.change(field("availability.0.start_time"),{target:{value:"10:00"}});
  fireEvent.click(screen.getByRole("button",{name:"Adicionar horario"}));
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  const reload=await screen.findByRole("button",{name:"Descartar rascunho e carregar atual"});
  expect(field("specialty").value).toBe("Draft");
  expect(field("availability.0.start_time").value).toBe("10:00");
  expect(field("availability.1.start_time")).not.toBeNull();
  expect(update.mock.calls[0][1]).toMatchObject({version:1,specialty:"Draft"});
  expect(update.mock.calls[0][1].availability).toHaveLength(2);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(reload);
  await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(field("specialty").value).toBe("Draft");
  expect(field("availability.0.start_time").value).toBe("10:00");
  expect(field("availability.1.start_time")).not.toBeNull();
  fireEvent.click(reload);
  await waitFor(()=>expect(field("specialty").value).toBe("Current"));
  expect(field("availability.0.start_time").value).toBe("09:00");
  expect(field("availability.1.start_time")).toBeNull();
  fireEvent.change(field("full_name"),{target:{value:"Reviewed Fictitious Dentist"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1]).toMatchObject({version:2,specialty:"Current",
    full_name:"Reviewed Fictitious Dentist",availability:slots("09:00")});
  await waitFor(()=>expect(container.querySelector('[name="full_name"]')).toBeNull());
});
