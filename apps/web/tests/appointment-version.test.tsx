import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { AppointmentsPage } from "../src/pages/appointments/appointments-page";
import { CalendarPage } from "../src/pages/appointments/calendar-page";
import { ToastProvider } from "../src/components/ui/toast";
import { appointmentService, patientService, dentistService, procedureService } from "../src/lib/services";
import type { Appointment, Patient, Dentist, Procedure } from "../src/types";

vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:()=>true})}));
vi.mock("react-big-calendar",async(importOriginal)=>({
  ...await importOriginal<typeof import("react-big-calendar")>(),
  Calendar:({events,onSelectEvent}:{events: unknown[];onSelectEvent:(event:unknown)=>void})=>
    <button onClick={()=>onSelectEvent(events[0])} disabled={!events.length}>Editar evento</button>,
}));
let client: QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.restoreAllMocks();});

it.each([["lista",AppointmentsPage,"Editar"],["calendário",CalendarPage,"Editar evento"]] as const)(
  "%s rejects nonexistent/repeated clinical hours before sending and retains the draft",async(_name,Page,button)=>{
    const patientId="11111111-1111-4111-8111-111111111111", dentistId="22222222-2222-4222-8222-222222222222";
    const appointment={id:"44444444-4444-4444-8444-444444444444",version:4,patient_id:patientId,dentist_id:dentistId,
      patient_name:"Fictitious timezone",dentist_name:"Fictitious dentist",start_at:"2020-01-08T01:30:00Z",
      end_at:"2020-01-08T02:30:00Z",status:"scheduled",notes:"Original",procedure_ids:[]} as Appointment;
    vi.spyOn(appointmentService,"list").mockResolvedValue([appointment]);
    vi.spyOn(patientService,"listAll").mockResolvedValue({items:[{id:patientId,full_name:"Fictitious timezone",active:true} as Patient],total:1});
    vi.spyOn(dentistService,"listAll").mockResolvedValue({items:[{id:dentistId,full_name:"Fictitious dentist",active:true} as Dentist],total:1});
    vi.spyOn(procedureService,"listAll").mockResolvedValue({items:[],total:0});
    const update=vi.spyOn(appointmentService,"update").mockResolvedValue(appointment);
    client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    const {container}=render(<QueryClientProvider client={client}><ToastProvider><Page /></ToastProvider></QueryClientProvider>);
    const field=(name:string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
    const edit=await screen.findByRole("button",{name:button,exact:true});
    await waitFor(()=>expect((edit as HTMLButtonElement).disabled).toBe(false));fireEvent.click(edit);
    await waitFor(()=>expect(field("start_at")?.disabled).toBe(false));
    expect(field("start_at").value).toBe("2020-01-07T22:30");
    for (const value of ["2018-11-04T00:30", "2019-02-16T23:30"]) {
      fireEvent.change(field("start_at"),{target:{value}});
      fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
      await screen.findByText(/horário de verão/);
      expect(update).not.toHaveBeenCalled();expect(field("start_at").value).toBe(value);
    }
  });

it.each([["lista",AppointmentsPage,"Editar"],["calendário",CalendarPage,"Editar evento"]] as const)(
  "%s preserves untouched timestamps at microsecond precision and converts only an edited boundary",async(_name,Page,button)=>{
    const patientId="11111111-1111-4111-8111-111111111111", dentistId="22222222-2222-4222-8222-222222222222";
    const appointment={id:"44444444-4444-4444-8444-444444444444",version:4,patient_id:patientId,dentist_id:dentistId,
      patient_name:"Fictitious precision",dentist_name:"Fictitious dentist",start_at:"2030-01-07T10:00:12.123456-03:00",
      end_at:"2030-01-07T14:00:47.654321Z",status:"scheduled",notes:"Original",procedure_ids:[]} as Appointment;
    vi.spyOn(appointmentService,"list").mockResolvedValue([appointment]);
    vi.spyOn(patientService,"listAll").mockResolvedValue({items:[{id:patientId,full_name:"Fictitious precision",active:true} as Patient],total:1});
    vi.spyOn(dentistService,"listAll").mockResolvedValue({items:[{id:dentistId,full_name:"Fictitious dentist",active:true} as Dentist],total:1});
    vi.spyOn(procedureService,"listAll").mockResolvedValue({items:[],total:0});
    const update=vi.spyOn(appointmentService,"update").mockResolvedValue(appointment);
    client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    const {container}=render(<QueryClientProvider client={client}><ToastProvider><Page /></ToastProvider></QueryClientProvider>);
    const field=(name:string)=>container.querySelector(`[name="${name}"]`) as HTMLInputElement;
    const open=async()=>{
      const edit=await screen.findByRole("button",{name:button,exact:true});
      await waitFor(()=>expect((edit as HTMLButtonElement).disabled).toBe(false));fireEvent.click(edit);
      await waitFor(()=>expect(field("start_at")?.disabled).toBe(false));
    };
    await open();fireEvent.change(field("notes"),{target:{value:"Only notes"}});
    fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
    await waitFor(()=>expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).toMatchObject({version:4,start_at:appointment.start_at,end_at:appointment.end_at,notes:"Only notes"});
    await waitFor(()=>expect(field("start_at")).toBeNull());
    for (const boundary of ["start_at","end_at"] as const) {
      await open();const changed=field(boundary).value.slice(0,-2)+"15";
      fireEvent.change(field(boundary),{target:{value:changed}});
      fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
      await waitFor(()=>expect(field("start_at")).toBeNull());
      expect(update.mock.calls.at(-1)![1]).toMatchObject({
        [boundary]:new Date(changed+":00-03:00").toISOString(),
        [boundary==="start_at"?"end_at":"start_at"]:appointment[boundary==="start_at"?"end_at":"start_at"],
      });
    }
  });

it.each([["lista",AppointmentsPage,"Editar"],["calendário",CalendarPage,"Editar evento"]] as const)(
  "%s keeps draft dates/procedures and original version until explicit reload",async(_name,Page,button)=>{
    const patientId="11111111-1111-4111-8111-111111111111";
    const dentistId="22222222-2222-4222-8222-222222222222";
    const procedureId="33333333-3333-4333-8333-333333333333";
    const appointment={id:"44444444-4444-4444-8444-444444444444",version:1,patient_id:patientId,dentist_id:dentistId,
      patient_name:"Fictitious Patient",dentist_name:"Fictitious Dentist",start_at:"2030-01-07T13:00:00Z",
      end_at:"2030-01-07T14:00:00Z",status:"scheduled",notes:"Original",procedure_ids:[procedureId]} as Appointment;
    const list = vi.spyOn(appointmentService,"list").mockResolvedValue([appointment]);
    vi.spyOn(patientService,"listAll").mockResolvedValue({items:[{id:patientId,full_name:"Fictitious Patient",active:true} as Patient],total:1});
    vi.spyOn(dentistService,"listAll").mockResolvedValue({items:[{id:dentistId,full_name:"Fictitious Dentist",active:true} as Dentist],total:1});
    vi.spyOn(procedureService,"listAll").mockResolvedValue({items:[{id:procedureId,name:"Fictitious Procedure",active:true,duration_minutes:15} as Procedure],total:1});
    const failure=(status:number)=>new AxiosError("failure","ERR_BAD_RESPONSE",undefined,undefined,
      {status,statusText:"Error",data:{detail:"Conflito de edição."},headers:{},config:{} as never});
    const update=vi.spyOn(appointmentService,"update").mockRejectedValueOnce(failure(409)).mockResolvedValue({...appointment,version:3});
    const get=vi.spyOn(appointmentService,"get").mockRejectedValueOnce(failure(503)).mockResolvedValue({
      ...appointment,version:2,notes:"Other operator",end_at:"2030-01-07T14:30:00Z",procedure_ids:[]});
    client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    const {container}=render(<QueryClientProvider client={client}><ToastProvider><Page /></ToastProvider></QueryClientProvider>);
    const edit=await screen.findByRole("button",{name:button,exact:true});
    await waitFor(()=>expect((edit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(edit);
    await waitFor(()=>expect(container.querySelector('[name="start_at"]')?.matches(":disabled")).toBe(false));
    const notes=()=>container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
    const end=()=>container.querySelector('input[name="end_at"]') as HTMLInputElement;
    const originalEnd=end().value;
    fireEvent.change(notes(),{target:{value:"My draft"}});
    // A background list refresh must not adopt the remote form/version/references.
    list.mockResolvedValue([{...appointment,version:2,notes:"Remote list",end_at:"2030-01-07T14:30:00Z"}]);
    fireEvent.click(screen.getByRole("button",{name:"Atualizar agenda",exact:true}));
    await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect((screen.getByRole("button",{name:"Atualizar agenda"}) as HTMLButtonElement).disabled).toBe(false));
    expect(notes().value).toBe("My draft"); expect(end().value).toBe(originalEnd);
    expect(procedureService.listAll).toHaveBeenCalledTimes(Page === AppointmentsPage ? 2 : 1);
    list.mockRejectedValueOnce(failure(503));
    fireEvent.click(screen.getByRole("button",{name:"Atualizar agenda",exact:true}));
    await screen.findByText(/Não foi possível atualizar a agenda/);
    expect(notes().value).toBe("My draft"); expect(end().value).toBe(originalEnd);
    fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
    const reload=await screen.findByRole("button",{name:/Descartar rascunho e carregar (consulta )?atual/});
    expect(notes().value).toBe("My draft");
    expect(end().value).toBe(originalEnd);
    expect(update.mock.calls[0][1]).toMatchObject({version:1,procedure_ids:[procedureId],notes:"My draft"});
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(reload);
    await waitFor(()=>expect(get).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
    expect(notes().value).toBe("My draft");
    fireEvent.click(reload);
    await waitFor(()=>expect(notes().value).toBe("Other operator"));
    await waitFor(()=>expect(container.querySelector('[name="start_at"]')?.matches(":disabled")).toBe(false));
    expect(end().value).not.toBe(originalEnd);
    fireEvent.change(notes(),{target:{value:"Reviewed"}});
    fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
    await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1]).toMatchObject({version:2,procedure_ids:[],notes:"Reviewed",end_at:"2030-01-07T14:30:00Z"});
    await waitFor(()=>expect(container.querySelector('textarea[name="notes"]')).toBeNull());
    list.mockRejectedValue(failure(403));
    fireEvent.click(screen.getByRole("button",{name:"Atualizar agenda",exact:true}));
    await screen.findByText("Seu acesso à agenda foi encerrado. Entre novamente.");
    expect(screen.queryByText("Fictitious Patient")).toBeNull();
  });
