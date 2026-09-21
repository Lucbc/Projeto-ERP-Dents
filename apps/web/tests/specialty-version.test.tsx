import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { SpecialtiesPage } from "../src/pages/specialties/specialties-page";
import { ToastProvider } from "../src/components/ui/toast";
import { specialtyService } from "../src/lib/services";
import type { Specialty } from "../src/types";

vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
const specialty={id:"fictitious",name:"Original",active:true,version:1} as Specialty;
const failure=(status: number,code?: string)=>new AxiosError("failure","ERR_BAD_RESPONSE",undefined,undefined,
  {status,statusText:"Error",data:{detail:"Revise o cadastro.",code},headers:{},config:{} as never});
function setup() {
  vi.spyOn(specialtyService,"list").mockResolvedValue({items:[specialty],total:1});
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const {container}=render(<QueryClientProvider client={client}><ToastProvider><SpecialtiesPage /></ToastProvider></QueryClientProvider>);
  return (name: string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
}

it("preserves name and activation after stale edit and failed reload, then saves explicitly loaded version",async()=>{
  const update=vi.spyOn(specialtyService,"update").mockRejectedValueOnce(failure(409,"stale_version"))
    .mockResolvedValue({...specialty,version:3});
  const get=vi.spyOn(specialtyService,"get").mockRejectedValueOnce(failure(503))
    .mockResolvedValue({...specialty,name:"Current",active:false,version:2});
  const field=setup();
  fireEvent.click(await screen.findByRole("button",{name:"Editar"}));
  fireEvent.change(field("name"),{target:{value:"Draft"}});
  fireEvent.change(field("active"),{target:{value:"false"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  const reload=await screen.findByRole("button",{name:"Descartar rascunho e carregar atual"});
  expect(field("name").value).toBe("Draft");
  expect(field("active").value).toBe("false");
  expect(update.mock.calls[0][1]).toEqual({version:1,name:"Draft",active:false});
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(reload);
  await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(field("name").value).toBe("Draft");
  expect(field("active").value).toBe("false");
  fireEvent.click(reload);
  await waitFor(()=>expect(field("name").value).toBe("Current"));
  expect(field("active").value).toBe("false");
  fireEvent.change(field("name"),{target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1]).toEqual({version:2,name:"Reviewed",active:false});
  await waitFor(()=>expect(field("name")).toBeNull());
});

it.each(["specialty_name_exists",undefined])("does not mislabel conflict %s as stale version; keeps editable draft",async(code)=>{
  const update=vi.spyOn(specialtyService,"update").mockRejectedValueOnce(failure(409,code))
    .mockResolvedValue({...specialty,version:2});
  const get=vi.spyOn(specialtyService,"get");
  const field=setup();
  fireEvent.click(await screen.findByRole("button",{name:"Editar"}));
  fireEvent.change(field("name"),{target:{value:"Duplicate"}});
  fireEvent.change(field("active"),{target:{value:"false"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await screen.findByText("Revise o cadastro.");
  expect(screen.queryByRole("button",{name:"Descartar rascunho e carregar atual"})).toBeNull();
  expect(field("name").value).toBe("Duplicate");
  expect(field("active").value).toBe("false");
  expect(get).not.toHaveBeenCalled();
  fireEvent.change(field("name"),{target:{value:"Corrected"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1]).toEqual({version:1,name:"Corrected",active:false});
});

it("keeps new specialty draft after duplicate name without requesting a version",async()=>{
  const create=vi.spyOn(specialtyService,"create").mockRejectedValueOnce(failure(409,"specialty_name_exists"))
    .mockResolvedValue(specialty);
  const field=setup();
  fireEvent.click(screen.getByRole("button",{name:"Nova"}));
  fireEvent.change(field("name"),{target:{value:"Duplicate"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await screen.findByText("Revise o cadastro.");
  expect(field("name").value).toBe("Duplicate");
  expect(screen.queryByRole("button",{name:"Descartar rascunho e carregar atual"})).toBeNull();
  fireEvent.change(field("name"),{target:{value:"Corrected"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await waitFor(()=>expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[1][0]).toEqual({name:"Corrected",active:true});
});
