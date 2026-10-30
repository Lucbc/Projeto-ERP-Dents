import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { patientService } from "../src/lib/services";
import { usePatientReferences } from "../src/pages/appointments/use-patient-references";
import { PatientPicker } from "../src/pages/appointments/patient-picker";
import type { Patient } from "../src/types";

const first = { id: "first", full_name: "Fictitious Same Name", birth_date: "1990-01-01" } as Patient;
const last = { id: "last", full_name: "Fictitious Same Name", birth_date: "2000-01-01", cpf: "52998224725", active: false } as Patient;
const failure = (status: number) => new AxiosError("test", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "error", data: {}, headers: {}, config: {} as never });
const tick = async (ms = 300) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function Form({ initial = "", action = 1, allowed = true }: { initial?: string; action?: number | null; allowed?: boolean }) {
  const [id, setId] = useState(initial);
  const source = usePatientReferences(action, id, allowed);
  return <><PatientPicker source={source} value={id} onChange={setId} name="patient_id" />
    <button disabled={!source.ready || !source.items.some(p => p.id === id)}>Salvar</button>
    <button onClick={() => void source.reload()}>Recarregar</button></>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(patientService, "list").mockResolvedValue({ items: [first], total: 5000 });
  vi.spyOn(patientService, "get").mockResolvedValue(last);
  vi.spyOn(patientService, "listAll").mockRejectedValue(new Error("Full collection forbidden"));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("opens a bounded page and resolves an existing selected patient outside it", async () => {
  render(<Form initial="last" />); await tick();
  expect(patientService.list).toHaveBeenCalledTimes(1);
  expect(patientService.list).toHaveBeenCalledWith({ limit: 20, offset: 0 }, expect.any(AbortSignal));
  expect(patientService.get).toHaveBeenCalledWith("last", expect.any(AbortSignal));
  expect(patientService.listAll).not.toHaveBeenCalled();
  expect((screen.getByRole("combobox", { name: "Paciente" }) as HTMLSelectElement).value).toBe("last");
  expect(screen.getByRole("option", { name: /2000.*CPF.*inativo/ })).toBeTruthy();
  expect((screen.getByText("Salvar") as HTMLButtonElement).disabled).toBe(false);
});

it("searches on the server after typing, distinguishes homonyms and retains selection across pages", async () => {
  render(<Form />); await tick();
  vi.mocked(patientService.list).mockResolvedValue({ items: [first, last], total: 45 });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Same Name" } });
  await tick(100); expect(patientService.list).toHaveBeenCalledTimes(1);
  await tick(200); expect(patientService.list).toHaveBeenLastCalledWith({ search: "Same Name", limit: 20, offset: 0 }, expect.any(AbortSignal));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "last" } }); await tick(); await tick();
  vi.mocked(patientService.list).mockResolvedValue({ items: [], total: 45 });
  fireEvent.click(screen.getByText("Mais pacientes")); await tick();
  expect(patientService.list).toHaveBeenLastCalledWith({ search: "Same Name", limit: 20, offset: 20 }, expect.any(AbortSignal));
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("last");
  expect(screen.getByRole("option", { name: /2000/ })).toBeTruthy();
});

it("ignores late search results and aborts the superseded request", async () => {
  render(<Form />); await tick();
  let finish!: (value: { items: Patient[]; total: number }) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(patientService.list).mockImplementationOnce((_p, s) => { signal = s; return new Promise(resolve => finish = resolve); });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "old" } }); await tick();
  vi.mocked(patientService.list).mockResolvedValue({ items: [last], total: 1 });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "new" } }); await tick();
  expect(signal?.aborted).toBe(true);
  await act(async () => finish({ items: [first], total: 1 }));
  expect(screen.queryByRole("option", { name: /1990/ })).toBeNull();
  expect(screen.getByRole("option", { name: /2000/ })).toBeTruthy();
});

it("hides denied patient copies and blocks saving after a search denial", async () => {
  render(<Form initial="last" />); await tick();
  vi.mocked(patientService.list).mockRejectedValue(failure(403));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "denied" } }); await tick();
  expect(screen.queryByRole("option", { name: /Same Name/ })).toBeNull();
  expect((screen.getByText("Salvar") as HTMLButtonElement).disabled).toBe(true);
});

it("does not replace a deleted selection and allows explicit recovery after reload", async () => {
  vi.mocked(patientService.get).mockRejectedValue(failure(404));
  render(<Form initial="last" />); await tick();
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("last");
  expect(screen.getByRole("option", { name: "Paciente selecionado indisponível" })).toBeTruthy();
  expect((screen.getByText("Salvar") as HTMLButtonElement).disabled).toBe(true);
  vi.mocked(patientService.get).mockResolvedValue(last); fireEvent.click(screen.getByText("Recarregar")); await tick();
  expect((screen.getByText("Salvar") as HTMLButtonElement).disabled).toBe(false);
});

it("reports search errors, preserves the verified selection and retries", async () => {
  render(<Form initial="last" />); await tick();
  vi.mocked(patientService.list).mockRejectedValue(failure(503));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "query" } }); await tick();
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("last");
  expect(screen.getByText(/Não foi possível buscar/)).toBeTruthy();
  vi.mocked(patientService.list).mockResolvedValue({ items: [first], total: 1 });
  fireEvent.click(screen.getByText("Tentar busca novamente")); await tick();
  expect(screen.getByRole("option", { name: /1990/ })).toBeTruthy();
});
