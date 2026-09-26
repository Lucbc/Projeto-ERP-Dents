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

it.each([["lista",AppointmentsPage,"Editar",false],["calendário",CalendarPage,"Editar evento",false],
  ["lista nova",AppointmentsPage,"Nova",true],["calendário nova",CalendarPage,"Nova consulta",true]] as const)(
  "%s availability conflict preserves draft and requires successful reference refresh without automatic retry",async(_name,Page,button,isNew)=>{
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
      {status,statusText:"Error",data:{detail:"Horário indisponível.",code:"availability_conflict"},headers:{},config:{} as never});
    const update=vi.spyOn(appointmentService,"update").mockRejectedValueOnce(failure(409)).mockResolvedValue({...appointment,version:2});
    const create=vi.spyOn(appointmentService,"create").mockRejectedValueOnce(failure(409)).mockResolvedValue(appointment);
    const mutation=isNew ? create : update;
    client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    const {container}=render(<QueryClientProvider client={client}><ToastProvider><Page /></ToastProvider></QueryClientProvider>);
    const edit=await screen.findByRole("button",{name:button,exact:true});
    await waitFor(()=>expect((edit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(edit);
    if (isNew) {
      fireEvent.change(container.querySelector('[name="patient_id"]')!,{target:{value:patientId}});
      fireEvent.change(container.querySelector('[name="dentist_id"]')!,{target:{value:dentistId}});
      fireEvent.change(container.querySelector('[name="start_at"]')!,{target:{value:"2030-01-07T10:00"}});
      fireEvent.change(container.querySelector('[name="end_at"]')!,{target:{value:"2030-01-07T11:00"}});
    }
    const notes=()=>container.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
    fireEvent.change(notes(),{target:{value:"My draft"}});
    fireEvent.click(screen.getByRole("button",{name:"Salvar",exact:true}));
    const reload=await screen.findByRole("button",{name:"Atualizar disponibilidade para revisar"});
    const save=()=>screen.getByRole("button",{name:"Salvar",exact:true}) as HTMLButtonElement;
    expect(notes().value).toBe("My draft");
    expect(screen.queryByRole("button",{name:/Descartar rascunho/})).toBeNull();
    expect(save().disabled).toBe(true);
    vi.mocked(dentistService.listAll).mockRejectedValueOnce(failure(503));
    fireEvent.click(reload);
    await waitFor(()=>expect(vi.mocked(dentistService.listAll)).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
    expect(save().disabled).toBe(true);
    expect(notes().value).toBe("My draft");
    fireEvent.click(reload);
    await waitFor(()=>expect(save().disabled).toBe(false));
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(notes().value).toBe("My draft");
    fireEvent.click(save());
    await waitFor(()=>expect(mutation).toHaveBeenCalledTimes(2));
    if (isNew) expect(create.mock.calls[1][0]).toMatchObject({notes:"My draft",patient_id:patientId,dentist_id:dentistId});
    else expect(update.mock.calls[1][1]).toMatchObject({version:1,notes:"My draft",procedure_ids:[procedureId]});
    await waitFor(()=>expect(container.querySelector('textarea[name="notes"]')).toBeNull());
  });
