import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { CalendarPage } from "../src/pages/appointments/calendar-page";
import { ToastProvider } from "../src/components/ui/toast";
import { ReadSuspensionContext } from "../src/hooks/read-suspension";
import { appointmentService, patientService, dentistService, procedureService } from "../src/lib/services";
import type { Appointment, Patient, Dentist, Procedure } from "../src/types";
vi.mock("react-big-calendar",async(original)=>({...await original<typeof import("react-big-calendar")>(),
  Calendar:({events,onSelectEvent,onSelectSlot}:{events:{color:string}[];onSelectEvent:(event:unknown)=>void;onSelectSlot:(slot:{start:Date;end:Date;slots:Date[]})=>void})=><div>
    <button onClick={()=>onSelectEvent(events[0])} disabled={!events.length}>Editar evento</button>
    <button onClick={()=>onSelectSlot({start:new Date("2030-01-07T13:00:00Z"),end:new Date("2030-01-07T14:00:00Z"),slots:[new Date("2030-01-07T13:00:00Z")]})}>Selecionar intervalo</button>
    <output data-testid="grid-color">{events[0]?.color}</output>
  </div>}));
let denied: string, client: QueryClient;
vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:(resource:string)=>resource!==denied})}));
const patient={id:"11111111-1111-4111-8111-111111111111",full_name:"Fictitious Patient",active:true} as Patient;
const dentist={id:"22222222-2222-4222-8222-222222222222",full_name:"Fictitious Dentist",active:true,color:"#123456"} as Dentist;
const procedure={id:"33333333-3333-4333-8333-333333333333",name:"Fictitious Procedure",duration_minutes:15,active:true} as Procedure;
const visit={id:"44444444-4444-4444-8444-444444444444",version:7,patient_id:patient.id,dentist_id:dentist.id,
  patient_name:patient.full_name,dentist_name:dentist.full_name,procedure_ids:[procedure.id],status:"scheduled",
  start_at:"2030-01-07T13:00:00Z",end_at:"2030-01-07T14:00:00Z",notes:"Fictitious original"} as Appointment;
const failure=(status:number,code="")=>new AxiosError("Fictitious","ERR_BAD_RESPONSE",undefined,undefined,
  {status,statusText:"Error",data:{code},headers:{},config:{} as never});
const tick=async(ms=10)=>{await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});await act(async()=>{await vi.advanceTimersByTimeAsync(1);});};
const button=(name:string)=>screen.getByRole("button",{name,exact:true}) as HTMLButtonElement;
const field=(name:string)=>document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const change=(name:string,value:string)=>fireEvent.change(field(name),{target:{value}});
function tree(suspended=false){return <QueryClientProvider client={client}><ReadSuspensionContext.Provider value={suspended}><ToastProvider><CalendarPage /></ToastProvider></ReadSuspensionContext.Provider></QueryClientProvider>;}
async function open(name="Nova consulta"){fireEvent.click(button(name));await tick();}
beforeEach(()=>{
  vi.useFakeTimers();onlineManager.setOnline(true);denied="";
  client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:15000,refetchOnWindowFocus:false}}});
  vi.spyOn(appointmentService,"list").mockResolvedValue([visit]);
  vi.spyOn(patientService,"listAll").mockResolvedValue({items:[patient],total:1});
  vi.spyOn(dentistService,"listAll").mockResolvedValue({items:[dentist],total:1});
  vi.spyOn(procedureService,"listAll").mockResolvedValue({items:[procedure],total:1});
});
afterEach(()=>{cleanup();client.clear();vi.restoreAllMocks();onlineManager.setOnline(true);vi.useRealTimers();});

it("freezes form options and automatic/manual ends across invalidation, reconnect and explicit refresh, then reads afresh",async()=>{
  render(tree());await tick();expect(procedureService.listAll).toHaveBeenCalledTimes(0);await open();
  change("start_at","2030-01-07T10:00");fireEvent.click(screen.getByRole("checkbox"));await tick();expect(field("end_at").value).toBe("2030-01-07T10:15");
  vi.mocked(procedureService.listAll).mockResolvedValue({items:[{...procedure,name:"Fictitious Remote",duration_minutes:60,active:false}],total:1});
  await act(async()=>{await client.invalidateQueries({queryKey:["procedures"]});});
  act(()=>onlineManager.setOnline(false));await tick(30010);act(()=>onlineManager.setOnline(true));await tick();
  expect(procedureService.listAll).toHaveBeenCalledTimes(1);expect(field("end_at").value).toBe("2030-01-07T10:15");
  fireEvent.click(button("Atualizar cadastros do formulário"));await tick();
  expect(field("end_at").value).toBe("2030-01-07T10:15");expect(screen.getByText("Duração sugerida: 60 min")).toBeTruthy();
  expect(screen.getByRole("checkbox").closest("label")?.textContent).toContain("(inativo)");
  fireEvent.click(button("Aplicar duração sugerida"));await tick();expect(field("end_at").value).toBe("2030-01-07T11:00");
  change("end_at","2030-01-07T12:00");vi.mocked(procedureService.listAll).mockResolvedValue({items:[{...procedure,duration_minutes:90}],total:1});
  fireEvent.click(button("Atualizar cadastros do formulário"));await tick();expect(field("end_at").value).toBe("2030-01-07T12:00");
  fireEvent.click(button("Cancelar"));await open();expect(procedureService.listAll).toHaveBeenCalledTimes(4);
  fireEvent.click(screen.getByRole("checkbox"));await tick();expect(screen.getByText("Duração sugerida: 90 min")).toBeTruthy();
});

it("keeps grid colors and navigation separate from the action and preserves captured version",async()=>{
  const update=vi.spyOn(appointmentService,"update").mockResolvedValue(visit);render(tree());await tick();
  expect(screen.getByTestId("grid-color").textContent).toBe("#123456");await open("Editar evento");
  change("notes","Fictitious draft");const end=field("end_at").value;
  vi.mocked(appointmentService.list).mockResolvedValue([{...visit,version:9}]);await tick(15010);
  vi.mocked(dentistService.listAll).mockResolvedValue({items:[{...dentist,color:"#abcdef"}],total:1});
  fireEvent.click(button("Atualizar cadastros do formulário"));await tick();fireEvent.click(button("Proximo"));await tick();
  expect(field("end_at").value).toBe(end);expect(screen.getByTestId("grid-color").textContent).toBe("#123456");
  fireEvent.click(button("Salvar"));await tick();expect(update).toHaveBeenCalledWith(visit.id,expect.objectContaining({version:7,notes:"Fictitious draft",procedure_ids:[procedure.id]}));
  fireEvent.click(button("Atualizar cores dos dentistas"));await tick();expect(screen.getByTestId("grid-color").textContent).toBe("#ABCDEF");
});

it("prepares interval selection once without overwriting it through duplicate button/event/slot clicks",async()=>{
  render(tree());await tick();await open("Selecionar intervalo");expect(field("start_at").value).toBe("2030-01-07T10:00");expect(field("end_at").value).toBe("2030-01-07T11:00");
  change("notes","Fictitious slot draft");fireEvent.click(button("Nova consulta"));fireEvent.click(button("Editar evento"));fireEvent.click(button("Selecionar intervalo"));await tick();
  expect(procedureService.listAll).toHaveBeenCalledTimes(1);expect(field("notes").value).toBe("Fictitious slot draft");expect(field("end_at").value).toBe("2030-01-07T11:00");
  fireEvent.click(button("Cancelar"));await open("Editar evento");expect(procedureService.listAll).toHaveBeenCalledTimes(2);expect(field("notes").value).toBe(visit.notes);
});

it("removes denied grid colors while retaining independently authorized appointment details",async()=>{
  const view=render(tree());await tick();await open("Editar evento");denied="dentists";view.rerender(tree());await tick();
  expect(screen.getByTestId("grid-color").textContent).not.toBe("#123456");expect(field("patient_id").value).toBe(patient.id);expect(button("Salvar").disabled).toBe(true);
  denied="";view.rerender(tree());await tick();expect(button("Salvar").disabled).toBe(false);expect(screen.getByTestId("grid-color").textContent).toBe("#123456");
});

it.each([503,403])("blocks partial preparation on %s and recovers without changing draft",async status=>{
  render(tree());await tick();await open("Editar evento");change("notes","Fictitious retained");
  vi.mocked(procedureService.listAll).mockRejectedValue(failure(status));fireEvent.click(button("Atualizar cadastros do formulário"));await tick();
  expect(button("Salvar").disabled).toBe(true);expect(field("patient_id").value).toBe(patient.id);
  expect(screen.queryByText("Nenhum procedimento cadastrado.")).toBeNull();
  if(status===403) expect(screen.queryByRole("checkbox",{name:/Fictitious Procedure/})).toBeNull();
  vi.mocked(procedureService.listAll).mockResolvedValue({items:[procedure],total:1});fireEvent.click(button("Atualizar cadastros do formulário"));await tick();
  expect(button("Salvar").disabled).toBe(false);expect(field("notes").value).toBe("Fictitious retained");
});

it("identifies missing links without selecting another record and allows conscious removal of absent procedures",async()=>{
  render(tree());await tick();await open("Editar evento");
  vi.mocked(patientService.listAll).mockResolvedValue({items:[],total:0});vi.mocked(procedureService.listAll).mockResolvedValue({items:[],total:0});
  fireEvent.click(button("Atualizar cadastros do formulário"));await tick();expect(field("patient_id").value).toBe(patient.id);expect(button("Salvar").disabled).toBe(true);
  expect(screen.getByRole("checkbox").closest("label")?.textContent).toContain(procedure.id);
  fireEvent.click(screen.getByRole("checkbox"));await tick();vi.mocked(patientService.listAll).mockResolvedValue({items:[patient],total:1});
  fireEvent.click(button("Atualizar cadastros do formulário"));await tick();expect(button("Salvar").disabled).toBe(false);
});

it("cancels preparation on close/unmount and ignores the old result after reopening",async()=>{
  const view=render(tree());await tick();let finish!:(v:{items:Procedure[];total:number})=>void;let signal:AbortSignal|undefined;
  vi.mocked(procedureService.listAll).mockImplementationOnce((_p,s)=>{signal=s;return new Promise(done=>finish=done);});
  fireEvent.click(button("Nova consulta"));fireEvent.click(button("Nova consulta"));await tick();expect(procedureService.listAll).toHaveBeenCalledTimes(1);
  expect(field("notes").matches(":disabled")).toBe(true);fireEvent.click(button("Cancelar"));await tick();expect(signal?.aborted).toBe(true);await open();
  await act(async()=>finish({items:[],total:0}));await tick();expect(screen.getByRole("checkbox")).toBeTruthy();
  vi.mocked(procedureService.listAll).mockImplementation((_p,s)=>{signal=s;return new Promise(()=>{});});fireEvent.click(button("Atualizar cadastros do formulário"));await tick();view.unmount();expect(signal?.aborted).toBe(true);
});

it("clears independently denied copies, reloads after grant and retains snapshots across global suspension",async()=>{
  const view=render(tree());await tick();await open("Editar evento");change("notes","Fictitious retained");
  view.rerender(tree(true));await tick();expect(button("Salvar").disabled).toBe(true);view.rerender(tree());await tick();expect(patientService.listAll).toHaveBeenCalledTimes(1);
  denied="procedures";view.rerender(tree());await tick();expect(button("Salvar").disabled).toBe(true);expect(screen.queryByText(procedure.name,{selector:"td"})).toBeNull();expect(field("patient_id").value).toBe(patient.id);
  denied="";view.rerender(tree());await tick();expect(button("Salvar").disabled).toBe(false);expect(field("notes").value).toBe("Fictitious retained");
});

it("does not unlock availability through ordinary refresh or failed review",async()=>{
  const write=vi.spyOn(appointmentService,"update").mockRejectedValue(failure(409,"availability_conflict"));render(tree());await tick();await open("Editar evento");fireEvent.click(button("Salvar"));await tick();
  fireEvent.click(button("Atualizar cadastros do formulário"));await tick();expect(button("Salvar").disabled).toBe(true);
  vi.mocked(dentistService.listAll).mockRejectedValueOnce(failure(503));fireEvent.click(button("Atualizar disponibilidade para revisar"));await tick();expect(button("Salvar").disabled).toBe(true);
  fireEvent.click(button("Atualizar disponibilidade para revisar"));await tick();expect(button("Salvar").disabled).toBe(false);expect(write).toHaveBeenCalledTimes(1);
});

it("ignores explicit version reload completing after unmount",async()=>{
  vi.spyOn(appointmentService,"update").mockRejectedValue(failure(409));let finish!:(v:Appointment)=>void;
  const get=vi.spyOn(appointmentService,"get").mockImplementation(()=>new Promise(done=>finish=done));const view=render(tree());await tick();await open("Editar evento");
  fireEvent.click(button("Salvar"));await tick();fireEvent.click(button("Descartar rascunho e carregar consulta atual"));await tick();view.unmount();
  expect(get.mock.calls[0][1]?.aborted).toBe(true);
  await act(async()=>finish({...visit,version:9}));await tick();expect(patientService.listAll).toHaveBeenCalledTimes(1);
});
