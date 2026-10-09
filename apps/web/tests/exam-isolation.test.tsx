import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { PatientExamsPage } from "../src/pages/patients/patient-exams-page";
import { examService, patientService } from "../src/lib/services";
import type { Exam, Patient } from "../src/types";
vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:()=>true})}));
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast",()=>({useToast:()=>({toast})}));
let client: QueryClient;
afterEach(()=>{cleanup();client.clear();vi.restoreAllMocks();toast.mockReset();});
function Navigate() {const go=useNavigate();return <><button onClick={()=>go('/patients/fictitious-b')}>Next fictitious patient</button>
  <button onClick={()=>go('/patients/fictitious-a')}>First fictitious patient</button></>;}
function setup(exams: Exam[] = []) {
  vi.spyOn(patientService,'get').mockImplementation(async id=>({id,full_name:id}) as Patient);
  vi.spyOn(examService,'listByPatient').mockResolvedValue(exams);
  vi.spyOn(examService,'uploadPolicy').mockResolvedValue({max_bytes:1024,extensions:['.png']});
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/patients/fictitious-a']}>
    <Navigate/><Routes><Route path='/patients/:patientId' element={<PatientExamsPage/>}/></Routes>
  </MemoryRouter></QueryClientProvider>);
}
it('patient change discards prior file and notes',async()=>{
  const {container}=setup();await screen.findByText(/fictitious-a/);
  const file=container.querySelector('input[type=file]') as HTMLInputElement;
  const notes=container.querySelector('input[name=notes]') as HTMLInputElement;
  const draft=new File(['fictitious'],'fictitious.png');
  fireEvent.change(file,{target:{files:[draft]}});fireEvent.change(notes,{target:{value:'Fictitious A draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Next fictitious patient'}));await screen.findByText(/fictitious-b/);
  expect((container.querySelector('input[name=notes]') as HTMLInputElement).value).toBe('');
  expect((container.querySelector('input[type=file]') as HTMLInputElement).files?.length).toBe(0);
  fireEvent.click(screen.getByRole('button',{name:'First fictitious patient'}));await screen.findByText(/fictitious-a/);
  expect((container.querySelector('input[name=notes]') as HTMLInputElement).value).toBe('');
  expect((container.querySelector('input[type=file]') as HTMLInputElement).files?.length).toBe(0);
});
it('patient change aborts old upload and ignores its late success',async()=>{
  let finish!:(value:Exam)=>void;let signal:AbortSignal|undefined;
  vi.spyOn(examService,'upload').mockImplementation((_id,_file,_notes,opts)=>{signal=opts?.signal;return new Promise(resolve=>{finish=resolve;});});
  const {container}=setup();await screen.findByText(/Limite por arquivo/);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['fictitious'],'fictitious.png')]}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await waitFor(()=>expect(examService.upload).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:'Next fictitious patient'}));await screen.findByText(/fictitious-b/);
  expect(signal?.aborted).toBe(true);
  fireEvent.change(container.querySelector('input[name=notes]')!,{target:{value:'Fictitious B draft'}});
  await act(async()=>finish({id:'fictitious-old-upload'} as Exam));
  await waitFor(()=>expect((container.querySelector('input[name=notes]') as HTMLInputElement).value).toBe('Fictitious B draft'));
  expect(toast).not.toHaveBeenCalled();
});

it('ignores old upload errors and progress after navigating',async()=>{
  let reject!:(error:Error)=>void;let progress!:(value:number)=>void;
  vi.spyOn(examService,'upload').mockImplementation((_id,_file,_notes,opts)=>{progress=opts!.onProgress;return new Promise((_resolve,fail)=>{reject=fail;});});
  const {container}=setup();await screen.findByText(/Limite por arquivo/);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['fictitious'],'fictitious.png')]}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await waitFor(()=>expect(examService.upload).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:'Next fictitious patient'}));await screen.findByText(/fictitious-b/);
  await act(async()=>{progress(90);reject(new Error('Fictitious old failure'));});
  expect(screen.queryByText(/90% enviado/)).toBeNull();expect(toast).not.toHaveBeenCalled();
});

const exam={id:'fictitious-exam',original_filename:'fictitious.png',mime_type:'image/png',size_bytes:10,uploaded_at:'2030-01-01T10:00:00Z'} as Exam;
it('aborts old previews and downloads; a late preview never creates a URL',async()=>{
  let finish!:(value:Blob)=>void;const signals:AbortSignal[]=[];
  URL.createObjectURL=vi.fn();URL.revokeObjectURL=vi.fn();
  vi.spyOn(examService,'previewImage').mockImplementation((_id,_mime,signal)=>{signals.push(signal!);return new Promise(resolve=>{finish=resolve;});});
  vi.spyOn(examService,'download').mockImplementation((_id,_name,signal)=>{signals.push(signal!);return new Promise(()=>{});});
  setup([exam]);
  fireEvent.click(await screen.findByRole('button',{name:'Visualizar imagem'}));
  fireEvent.click(screen.getByRole('button',{name:'Baixar'}));
  fireEvent.click(screen.getByRole('button',{name:'Next fictitious patient'}));await screen.findByText(/fictitious-b/);
  expect(signals).toHaveLength(2);expect(signals.every(s=>s.aborted)).toBe(true);
  await act(async()=>finish(new Blob(['fictitious'])));expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByRole('img')).toBeNull();
});

it('revokes a displayed preview and keeps a new deletion open after old deletion finishes',async()=>{
  URL.createObjectURL=vi.fn(()=> 'blob:fictitious-old');URL.revokeObjectURL=vi.fn();
  vi.spyOn(examService,'previewImage').mockResolvedValue(new Blob(['fictitious']));
  let finish!:()=>void;vi.spyOn(examService,'remove').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  setup([exam]);
  fireEvent.click(await screen.findByRole('button',{name:'Visualizar imagem'}));await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button',{name:'Excluir',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Confirmar exclusão'}));
  await waitFor(()=>expect(examService.remove).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:'Next fictitious patient'}));await screen.findByText(/fictitious-b/);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fictitious-old');
  fireEvent.click(await screen.findByRole('button',{name:'Excluir',exact:true}));
  await act(async()=>finish());expect(screen.getByRole('button',{name:'Confirmar exclusão'})).toBeTruthy();
  expect(toast).not.toHaveBeenCalled();
});

it('aborts patient and exam reads when changing identity and leaving the page',async()=>{
  const view=setup();await screen.findByText(/fictitious-a/);
  const signals:AbortSignal[]=[];
  vi.mocked(patientService.get).mockImplementation((_id,signal)=>{signals.push(signal!);return new Promise(()=>{});});
  vi.mocked(examService.listByPatient).mockImplementation((_id,signal)=>{signals.push(signal!);return new Promise(()=>{});});
  void client.refetchQueries({queryKey:['patient','fictitious-a']});
  void client.refetchQueries({queryKey:['exams','fictitious-a']});
  await waitFor(()=>expect(signals).toHaveLength(2));
  fireEvent.click(screen.getByRole('button',{name:'Next fictitious patient'}));
  await waitFor(()=>expect(signals).toHaveLength(4));expect(signals.slice(0,2).every(s=>s.aborted)).toBe(true);
  view.unmount();expect(signals.every(s=>s.aborted)).toBe(true);
});
