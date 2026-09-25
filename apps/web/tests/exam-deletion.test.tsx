import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
import { PatientExamsPage } from "../src/pages/patients/patient-exams-page";
import { ToastProvider } from "../src/components/ui/toast";
import { examService, patientService } from "../src/lib/services";
import type { Exam, Patient } from "../src/types";
let canDelete=true;
vi.mock("@/hooks/use-permissions",()=>({usePermissions:()=>({can:(_resource:string,action:string)=>action!=="delete"||canDelete})}));
let client: QueryClient;
const exam={id:"exam-a",patient_id:"patient-a",original_filename:"Fictitious saved.png",mime_type:"image/png",size_bytes:50,uploaded_at:"2030-01-01T10:00:00Z"} as Exam;
beforeEach(()=>{
  canDelete=true;
  URL.createObjectURL=vi.fn(()=>"blob:fictitious"); URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();client?.clear();vi.restoreAllMocks();});
function setup() {
  vi.spyOn(patientService,"get").mockResolvedValue({id:"patient-a",full_name:"Fictitious patient"} as Patient);
  vi.spyOn(examService,"uploadPolicy").mockResolvedValue({max_bytes:1024,extensions:[".png"]});
  const list=vi.spyOn(examService,"listByPatient").mockResolvedValue([exam]);
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const result=render(<MemoryRouter initialEntries={["/patients/patient-a/exams"]}><QueryClientProvider client={client}><ToastProvider>
    <Routes><Route path="/patients/:patientId/exams" element={<PatientExamsPage/>}/></Routes>
  </ToastProvider></QueryClientProvider></MemoryRouter>);
  return {...result,list};
}
it.each([404,403,503,500,"network"])("failure %s preserves upload and requires explicit successful reload",async status=>{
  const failure=status==="network"?new Error("offline"):new AxiosError("failure","ERR_BAD_RESPONSE",undefined,undefined,
    {status:Number(status),statusText:"Error",data:{detail:"Confira a lista de exames."},headers:{},config:{} as never});
  const remove=vi.spyOn(examService,"remove").mockRejectedValueOnce(failure).mockResolvedValue();
  const {container,list}=setup();
  fireEvent.click(await screen.findByRole("button",{name:"Excluir",exact:true}));
  expect(screen.getByText("Fictitious patient",{selector:"strong"})).toBeTruthy();
  expect(screen.getByText(exam.original_filename,{selector:"strong"})).toBeTruthy();
  const notes=container.querySelector('input[name="notes"]') as HTMLInputElement;
  const file=container.querySelector('input[type="file"]') as HTMLInputElement;
  const draft=new File(["fictitious"],"draft.png",{type:"image/png"});
  fireEvent.change(notes,{target:{value:"Fictitious draft"}});
  fireEvent.change(file,{target:{files:[draft]}});
  fireEvent.click(screen.getByRole("button",{name:"Confirmar exclusão"}));
  const reload=await screen.findByRole("button",{name:"Recarregar lista para conferir"});
  expect(remove).toHaveBeenCalledExactlyOnceWith(exam.id);
  expect(notes.value).toBe("Fictitious draft");expect(file.files?.[0]).toBe(draft);
  list.mockRejectedValueOnce(new Error("offline"));fireEvent.click(reload);
  await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(remove).toHaveBeenCalledTimes(1);
  fireEvent.click(reload);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Recarregar lista para conferir"})).toBeNull());
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  fireEvent.click(screen.getByRole("button",{name:"Confirmar exclusão"}));
  await waitFor(()=>expect(remove).toHaveBeenCalledTimes(2));
  expect(notes.value).toBe("Fictitious draft");expect(file.files?.[0]).toBe(draft);
});
it("blocks duplicate confirmation and revokes the removed preview",async()=>{
  let finish!:()=>void;
  const remove=vi.spyOn(examService,"remove").mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  vi.spyOn(examService,"previewImage").mockResolvedValue(new Blob(["fictitious"]));
  setup();fireEvent.click(await screen.findByRole("button",{name:"Visualizar imagem"}));
  await screen.findByRole("img");
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  const confirm=screen.getByRole("button",{name:"Confirmar exclusão"});
  fireEvent.click(confirm);fireEvent.click(confirm);
  await waitFor(()=>expect(remove).toHaveBeenCalledTimes(1));finish();
  await waitFor(()=>expect(screen.queryByRole("img")).toBeNull());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fictitious");
});
it("a preview finishing after deletion never reopens the image",async()=>{
  let finish!:(blob:Blob)=>void;
  vi.spyOn(examService,"previewImage").mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const remove=vi.spyOn(examService,"remove").mockResolvedValue();setup();
  fireEvent.click(await screen.findByRole("button",{name:"Visualizar imagem"}));
  fireEvent.click(screen.getByRole("button",{name:"Excluir",exact:true}));
  fireEvent.click(screen.getByRole("button",{name:"Confirmar exclusão"}));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Confirmar exclusão"})).toBeNull());
  expect(remove).toHaveBeenCalledTimes(1);finish(new Blob(["fictitious"]));
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(URL.createObjectURL).not.toHaveBeenCalled();expect(screen.queryByRole("img")).toBeNull();
});
it("missing patient identity disables deletion",async()=>{
  const {container}=setup();await screen.findByRole("button",{name:"Excluir",exact:true});
  vi.mocked(patientService.get).mockRejectedValue(new Error("unavailable"));
  await client.refetchQueries({queryKey:["patient","patient-a"]});
  await waitFor(()=>expect((screen.getByRole("button",{name:"Excluir",exact:true}) as HTMLButtonElement).disabled).toBe(true));
  expect(container.querySelector('input[name="notes"]')).toBeTruthy();
});
it("revoked permission prevents a pending confirmation",async()=>{
  const remove=vi.spyOn(examService,"remove").mockResolvedValue();setup();
  fireEvent.click(await screen.findByRole("button",{name:"Excluir",exact:true}));
  canDelete=false;
  client.setQueryData(["patient","patient-a"],{id:"patient-a",full_name:"Fictitious refreshed patient"});
  const confirm=screen.getByRole("button",{name:"Confirmar exclusão"});
  await waitFor(()=>expect((confirm as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(confirm);expect(remove).not.toHaveBeenCalled();
});
