import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AppointmentsPage } from "../src/pages/appointments/appointments-page";
import { CalendarPage } from "../src/pages/appointments/calendar-page";
import { ToastProvider } from "../src/components/ui/toast";
import { appointmentService, patientService, dentistService, procedureService } from "../src/lib/services";
import type { Appointment, Patient, Dentist } from "../src/types";

vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:()=>true})}));
vi.mock("react-big-calendar",async(importOriginal)=>({
  ...await importOriginal<typeof import("react-big-calendar")>(),
  Calendar:({events,onSelectEvent}:{events: unknown[];onSelectEvent:(event:unknown)=>void})=>
    <button onClick={()=>onSelectEvent(events[0])} disabled={!events.length}>Editar evento</button>,
}));
let client: QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.restoreAllMocks();});
const appointment={id:"44444444-4444-4444-8444-444444444444",version:1,
  patient_id:"11111111-1111-4111-8111-111111111111",dentist_id:"22222222-2222-4222-8222-222222222222",
  patient_name:"Fictitious Saved Patient",dentist_name:"Fictitious Dentist",start_at:"2030-01-07T13:00:00Z",
  end_at:"2030-01-07T14:00:00Z",status:"scheduled",notes:"Original",procedure_ids:[]} as Appointment;
const revised={...appointment,version:2,notes:"Reviewed appointment",start_at:"2030-01-07T15:00:00Z",end_at:"2030-01-07T16:00:00Z"};
const failure=(status:number)=>new AxiosError("failure","ERR_BAD_RESPONSE",undefined,undefined,
  {status,statusText:"Error",data:{detail:"Consulta alterada.",code:"stale_version"},headers:{},config:{} as never});
function setup(Page: typeof AppointmentsPage) {
  const list=vi.spyOn(appointmentService,"list").mockResolvedValue([appointment]);
  vi.spyOn(patientService,"listAll").mockResolvedValue({items:[{id:appointment.patient_id,full_name:appointment.patient_name,active:true} as Patient],total:1});
  vi.spyOn(dentistService,"listAll").mockResolvedValue({items:[{id:appointment.dentist_id,full_name:appointment.dentist_name,active:true} as Dentist],total:1});
  vi.spyOn(procedureService,"listAll").mockResolvedValue({items:[],total:0});
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const invalidation=vi.spyOn(client,"invalidateQueries");
  const view=render(<QueryClientProvider client={client}><ToastProvider><Page /></ToastProvider></QueryClientProvider>);
  return {...view,list,confirm,invalidation};
}

it("list captures displayed identity/version and requires successful reload and new confirmation",async()=>{
  const remove=vi.spyOn(appointmentService,"remove").mockRejectedValueOnce(failure(409)).mockResolvedValue();
  const {list,confirm,invalidation}=setup(AppointmentsPage);
  fireEvent.click(await screen.findByRole("button",{name:"Excluir",exact:true}));
  const reload=await screen.findByRole("button",{name:"Recarregar lista para conferir"});
  expect(remove).toHaveBeenCalledWith(appointment.id,1);
  expect(confirm.mock.calls[0][0]).toContain(appointment.patient_name);
  expect(confirm.mock.calls[0][0]).toContain(new Date(appointment.start_at).toLocaleString("pt-BR"));
  expect(confirm.mock.calls[0][0]).toContain("não cancela cobranças nem pagamentos");
  expect((screen.getByRole("button",{name:"Excluir",exact:true}) as HTMLButtonElement).disabled).toBe(true);
  list.mockRejectedValueOnce(failure(503)); fireEvent.click(reload);
  await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(remove).toHaveBeenCalledTimes(1);
  list.mockResolvedValue([revised]); fireEvent.click(reload);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Recarregar lista para conferir"})).toBeNull());
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  await waitFor(()=>expect(remove).toHaveBeenLastCalledWith(appointment.id,2));
  expect(confirm).toHaveBeenCalledTimes(2);
  await waitFor(()=>expect(invalidation).toHaveBeenCalledWith({queryKey:["financial"]}));
});

it.each([409,404,503,"network"] as const)("calendar preserves dirty draft after %s and reload replaces saved target explicitly",async(status)=>{
  const remove=vi.spyOn(appointmentService,"remove").mockRejectedValueOnce(status==="network"?new Error("offline"):failure(status)).mockResolvedValue();
  const get=vi.spyOn(appointmentService,"get").mockRejectedValueOnce(failure(503)).mockResolvedValue(revised);
  const {container,confirm,invalidation}=setup(CalendarPage);
  const edit=await screen.findByRole("button",{name:"Editar evento"});
  await waitFor(()=>expect((edit as HTMLButtonElement).disabled).toBe(false));fireEvent.click(edit);
  const notes=()=>container.querySelector('[name="notes"]') as HTMLTextAreaElement;
  const start=()=>container.querySelector('[name="start_at"]') as HTMLInputElement;
  fireEvent.change(notes(),{target:{value:"Fictitious dirty draft"}});
  fireEvent.change(start(),{target:{value:"2031-02-01T11:00"}});
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  const reload=await screen.findByRole("button",{name:"Descartar rascunho e carregar consulta atual"});
  expect(remove).toHaveBeenCalledWith(appointment.id,1);
  expect(confirm.mock.calls[0][0]).toContain(new Date(appointment.start_at).toLocaleString("pt-BR"));
  expect(confirm.mock.calls[0][0]).not.toContain("2031");
  expect(confirm.mock.calls[0][0]).toContain("rascunho não serão aplicadas");
  expect(notes().value).toBe("Fictitious dirty draft");
  expect(start().value).toBe("2031-02-01T11:00");
  expect(get).not.toHaveBeenCalled();
  expect((screen.getByRole("button",{name:"Excluir",exact:true}) as HTMLButtonElement).disabled).toBe(true);
  if(status===404) expect(screen.getByText(/A consulta não está mais disponível/)).toBeTruthy();
  if(status===503||status==="network") expect(screen.getByText(/Não foi possível confirmar a exclusão/)).toBeTruthy();
  fireEvent.click(reload);
  await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(notes().value).toBe("Fictitious dirty draft");
  fireEvent.click(reload);
  await waitFor(()=>expect(notes().value).toBe(revised.notes));
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  await waitFor(()=>expect(remove).toHaveBeenLastCalledWith(appointment.id,2));
  expect(confirm).toHaveBeenCalledTimes(2);
  await waitFor(()=>expect(notes()).toBeNull());
  expect(invalidation).toHaveBeenCalledWith({queryKey:["appointments"]});
  expect(invalidation).toHaveBeenCalledWith({queryKey:["financial"]});
});

it("closing and reopening the same cached calendar record does not bypass required review",async()=>{
  vi.spyOn(appointmentService,"remove").mockRejectedValue(failure(409));
  setup(CalendarPage);
  const edit=await screen.findByRole("button",{name:"Editar evento"});
  await waitFor(()=>expect((edit as HTMLButtonElement).disabled).toBe(false));fireEvent.click(edit);
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  await screen.findByRole("button",{name:"Descartar rascunho e carregar consulta atual"});
  fireEvent.click(screen.getByRole("button",{name:"Cancelar",exact:true}));
  fireEvent.click(edit);
  expect((screen.getByRole("button",{name:"Excluir",exact:true}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button",{name:"Descartar rascunho e carregar consulta atual"})).toBeTruthy();
});

it("calendar prevents switching appointment context during deletion and canceled confirmation sends nothing",async()=>{
  let finish!:()=>void;
  const remove=vi.spyOn(appointmentService,"remove").mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const {container,confirm}=setup(CalendarPage);
  const edit=await screen.findByRole("button",{name:"Editar evento"});
  await waitFor(()=>expect((edit as HTMLButtonElement).disabled).toBe(false));fireEvent.click(edit);
  confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  await waitFor(()=>expect(remove).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button",{name:"Nova consulta",exact:true}));
  expect(container.querySelector('[name="notes"]')).not.toBeNull();
  expect(screen.getByText("Editar consulta",{exact:true})).toBeTruthy();
  finish();await waitFor(()=>expect(container.querySelector('[name="notes"]')).toBeNull());
});
