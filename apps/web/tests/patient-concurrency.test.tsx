import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "./data-router";
import { AxiosError } from "axios";
import { PatientsPage } from "../src/pages/patients/patients-page";
import { ToastProvider } from "../src/components/ui/toast";
import { patientService } from "../src/lib/services";
import type { Patient } from "../src/types";

vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it("asks before discarding a new draft and preserves it when closing is declined", async () => {
  vi.spyOn(patientService,"list").mockResolvedValue({items:[],total:0});
  const confirm = vi.spyOn(window,"confirm").mockReturnValue(false);
  const create = vi.spyOn(patientService,"create");
  client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const {container}=render(<MemoryRouter><QueryClientProvider client={client}><ToastProvider><PatientsPage /></ToastProvider></QueryClientProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button",{name:"Novo"}));
  const name=()=>container.querySelector('input[name="full_name"]') as HTMLInputElement;
  fireEvent.change(name(),{target:{value:"Fictitious unsaved draft"}});
  fireEvent.click(screen.getByRole("button",{name:"Cancelar",exact:true}));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(name().value).toBe("Fictitious unsaved draft");
  const leaving = new Event("beforeunload",{cancelable:true});
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button",{name:"x",exact:true}));
  expect(name()).toBeNull();
  const closed = new Event("beforeunload",{cancelable:true});
  window.dispatchEvent(closed);
  expect(closed.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"Novo"}));
  expect(name().value).toBe("");
  expect(create).not.toHaveBeenCalled();
});

it("does not prompt for untouched forms or edits restored to their original values", async () => {
  const patient = {id:"fictitious",full_name:"Fictitious Patient",active:true,version:1,notes:"Original"} as Patient;
  vi.spyOn(patientService,"list").mockResolvedValue({items:[patient],total:1});
  const confirm = vi.spyOn(window,"confirm").mockReturnValue(false);
  client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const {container}=render(<MemoryRouter><QueryClientProvider client={client}><ToastProvider><PatientsPage /></ToastProvider></QueryClientProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button",{name:"Editar"}));
  const notes=container.querySelector('textarea[name="notes"]')!;
  fireEvent.change(notes,{target:{value:"Changed"}});
  const dirty = new Event("beforeunload",{cancelable:true}); window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  fireEvent.change(notes,{target:{value:"Original"}});
  const clean = new Event("beforeunload",{cancelable:true}); window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"Cancelar",exact:true}));
  expect(confirm).not.toHaveBeenCalled();
  expect(container.querySelector('textarea[name="notes"]')).toBeNull();
});

it("preserves a conflicting draft and only replaces it after an explicit successful reload", async () => {
  const patient = { id:"fictitious", full_name:"Fictitious Patient", active:true, version:1 } as Patient;
  vi.spyOn(patientService,"list").mockResolvedValue({items:[patient],total:1});
  const failure = (status: number) => new AxiosError("failure", "ERR_BAD_RESPONSE", undefined, undefined,
    {status,statusText:"Error",data:{detail:"Conflito de edição."},headers:{},config:{} as never});
  const update = vi.spyOn(patientService,"update").mockRejectedValueOnce(failure(409))
    .mockResolvedValue({...patient,version:3,notes:"Reviewed"});
  const get = vi.spyOn(patientService,"get").mockRejectedValueOnce(failure(503))
    .mockResolvedValue({...patient,version:2,notes:"Other operator"});
  client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const {container}=render(<MemoryRouter><QueryClientProvider client={client}><ToastProvider><PatientsPage /></ToastProvider></QueryClientProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button",{name:"Editar"}));
  const notes=()=>container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
  fireEvent.change(notes(),{target:{value:"My draft"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  const reload=await screen.findByRole("button",{name:"Descartar rascunho e carregar atual"});
  expect(notes().value).toBe("My draft");
  expect(update.mock.calls[0][1]).toMatchObject({version:1,notes:"My draft"});
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(reload);
  await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(notes().value).toBe("My draft");
  fireEvent.click(reload);
  await waitFor(()=>expect(notes().value).toBe("Other operator"));
  fireEvent.change(notes(),{target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar"}));
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1]).toMatchObject({version:2,notes:"Reviewed"});
  await waitFor(()=>expect(container.querySelector('textarea[name="notes"]')).toBeNull());
});
