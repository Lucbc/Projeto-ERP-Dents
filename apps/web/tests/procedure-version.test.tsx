import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ProceduresPage } from "../src/pages/procedures/procedures-page";
import { ToastProvider } from "../src/components/ui/toast";
import { procedureService } from "../src/lib/services";
import type { Procedure } from "../src/types";

vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it.each([null,0,12345])("keeps price and duration draft, then explicitly reloads price %s without changing its meaning", async (price) => {
  const procedure = {id:"fictitious",name:"Fictitious Procedure",active:true,version:1,
    price_cents:12000,duration_minutes:30,description:"Original"} as Procedure;
  vi.spyOn(procedureService,"list").mockResolvedValue({items:[procedure],total:1});
  const failure = (status: number) => new AxiosError("failure", "ERR_BAD_RESPONSE", undefined, undefined,
    {status,statusText:"Error",data:{detail:"Conflito de edição."},headers:{},config:{} as never});
  const update = vi.spyOn(procedureService,"update").mockRejectedValueOnce(failure(409))
    .mockResolvedValue({...procedure,version:3});
  const get = vi.spyOn(procedureService,"get").mockRejectedValueOnce(failure(503))
    .mockResolvedValue({...procedure,version:2,price_cents:price,duration_minutes:price===null?null:0});
  client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const {container}=render(<QueryClientProvider client={client}><ToastProvider><ProceduresPage /></ToastProvider></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button",{name:"Editar"}));
  const field=(name: string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
  fireEvent.change(field("price"),{target:{value:"321,09"}});
  fireEvent.change(field("duration_minutes"),{target:{value:"45"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  const reload=await screen.findByRole("button",{name:"Descartar rascunho e carregar atual"});
  expect(field("price").value).toBe("321,09");
  expect(field("duration_minutes").value).toBe("45");
  expect(update.mock.calls[0][1]).toMatchObject({version:1,price_cents:32109,duration_minutes:45});
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(reload);
  await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(field("price").value).toBe("321,09");
  expect(field("duration_minutes").value).toBe("45");
  fireEvent.click(reload);
  await waitFor(()=>expect(field("price").value).toBe(price===null?"":(price/100).toFixed(2).replace(".",",")));
  expect(field("duration_minutes").value).toBe(price===null?"":"0");
  fireEvent.change(field("description"),{target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1]).toMatchObject({version:2,price_cents:price,
    duration_minutes:price===null?null:0,description:"Reviewed"});
  await waitFor(()=>expect(container.querySelector('[name="price"]')).toBeNull());
});
