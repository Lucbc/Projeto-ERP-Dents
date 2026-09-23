import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ProceduresPage } from "../src/pages/procedures/procedures-page";
import { SpecialtiesPage } from "../src/pages/specialties/specialties-page";
import { ToastProvider } from "../src/components/ui/toast";
import { procedureService, specialtyService } from "../src/lib/services";

vi.mock("@/hooks/use-permissions", () => ({usePermissions: () => ({can: () => true})}));
let client: QueryClient;
afterEach(() => {cleanup(); client?.clear(); vi.restoreAllMocks();});
const cases = [["procedures",ProceduresPage,procedureService],["specialties",SpecialtiesPage,specialtyService]] as const;
const item = {id:"fictitious",name:"Fictitious catalog",version:1,active:true,price_cents:12000,duration_minutes:30};
function setup(Page: typeof ProceduresPage) {
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  render(<QueryClientProvider client={client}><ToastProvider><Page/></ToastProvider></QueryClientProvider>);
}
for (const [name,Page,service] of cases) {
  it(`${name}: captures displayed version and requires review/new confirmation after conflict`,async()=>{
    const list=vi.spyOn(service,"list").mockResolvedValue({items:[item],total:1} as never);
    const remove=vi.spyOn(service,"remove").mockRejectedValueOnce(new AxiosError("conflict","ERR_BAD_RESPONSE",undefined,undefined,
      {status:409,statusText:"Conflict",data:{detail:"Cadastro alterado.",code:"stale_version"},headers:{},config:{} as never})).mockResolvedValue(undefined);
    const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
    setup(Page);
    fireEvent.click(await screen.findByRole("button",{name:"Excluir"}));
    await screen.findByText("Cadastro alterado.");
    expect(remove).toHaveBeenCalledWith(item.id,1);
    expect((screen.getByRole("button",{name:"Excluir"}) as HTMLButtonElement).disabled).toBe(true);
    list.mockResolvedValue({items:[{...item,version:2,name:"Reviewed catalog"}],total:1} as never);
    fireEvent.click(screen.getByRole("button",{name:"Recarregar lista para conferir"}));
    await screen.findByText("Reviewed catalog");
    await waitFor(()=>expect((screen.getByRole("button",{name:"Excluir"}) as HTMLButtonElement).disabled).toBe(false));
    expect(remove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button",{name:"Excluir"}));
    await waitFor(()=>expect(remove).toHaveBeenCalledTimes(2));
    expect(remove).toHaveBeenLastCalledWith(item.id,2);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenLastCalledWith('Excluir “Reviewed catalog”?');
  });
  it(`${name}: uncertain deletion does not retry and failed refresh keeps the guard`,async()=>{
    const list=vi.spyOn(service,"list").mockResolvedValue({items:[item],total:1} as never);
    const remove=vi.spyOn(service,"remove").mockRejectedValue(new AxiosError("network"));
    vi.spyOn(window,"confirm").mockReturnValue(true);setup(Page);
    fireEvent.click(await screen.findByRole("button",{name:"Excluir"}));
    await screen.findByText(/Não foi possível confirmar a exclusão/);
    list.mockRejectedValue(new AxiosError("network"));
    fireEvent.click(screen.getByRole("button",{name:"Recarregar lista para conferir"}));
    await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect((screen.getByRole("button",{name:"Recarregar lista para conferir"}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText(/Não foi possível confirmar a exclusão/)).toBeTruthy();
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it(`${name}: cancelled confirmation never sends deletion`,async()=>{
    vi.spyOn(service,"list").mockResolvedValue({items:[item],total:1} as never);
    const remove=vi.spyOn(service,"remove").mockResolvedValue(undefined);
    vi.spyOn(window,"confirm").mockReturnValue(false);setup(Page);
    fireEvent.click(await screen.findByRole("button",{name:"Excluir"}));expect(remove).not.toHaveBeenCalled();
  });
}
