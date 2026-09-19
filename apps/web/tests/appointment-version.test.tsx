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
  "%s keeps draft dates/procedures and original version until explicit reload",async(_name,Page,button)=>{
    const patientId="11111111-1111-4111-8111-111111111111";
    const dentistId="22222222-2222-4222-8222-222222222222";
    const procedureId="33333333-3333-4333-8333-333333333333";
    const appointment={id:"44444444-4444-4444-8444-444444444444",version:1,patient_id:patientId,dentist_id:dentistId,
      patient_name:"Fictitious Patient",dentist_name:"Fictitious Dentist",start_at:"2030-01-07T13:00:00Z",
      end_at:"2030-01-07T14:00:00Z",status:"scheduled",notes:"Original",procedure_ids:[procedureId]} as Appointment;
    vi.spyOn(appointmentService,"list").mockResolvedValue([appointment]);
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
    const notes=()=>container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
    const end=()=>container.querySelector('input[name="end_at"]') as HTMLInputElement;
    const originalEnd=end().value;
    fireEvent.change(notes(),{target:{value:"My draft"}});
    fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
    const reload=await screen.findByRole("button",{name:"Descartar rascunho e carregar atual"});
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
    expect(end().value).not.toBe(originalEnd);
    fireEvent.change(notes(),{target:{value:"Reviewed"}});
    fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
    await waitFor(()=>expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1]).toMatchObject({version:2,procedure_ids:[],notes:"Reviewed",end_at:"2030-01-07T14:30:00.000Z"});
    await waitFor(()=>expect(container.querySelector('textarea[name="notes"]')).toBeNull());
  });
