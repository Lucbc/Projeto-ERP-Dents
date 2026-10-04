import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ProceduresPage } from "../src/pages/procedures/procedures-page";
import { SpecialtiesPage } from "../src/pages/specialties/specialties-page";
import { AppointmentsPage } from "../src/pages/appointments/appointments-page";
import { ToastProvider } from "../src/components/ui/toast";
import { appointmentService, dentistService, patientService, procedureService, specialtyService } from "../src/lib/services";
import { api } from "../src/lib/api";
import type { Procedure, Specialty } from "../src/types";
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
let client: QueryClient;
const item = { id: "11111111-1111-4111-8111-111111111111", name: "Fictitious original", active: true, version: 7,
  duration_minutes: 30, price_cents: 12000, description: "Fictitious description" } as Procedure & Specialty;
const failure = (status: number) => new AxiosError("Fictitious error", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "Error", data: { detail: "Fictitious conflict", code: "stale_version" }, headers: {}, config: {} as never });
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, 7, 12)); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

describe.each([
  { resource: "procedures", subject: "procedimentos", service: procedureService, Page: ProceduresPage },
  { resource: "specialties", subject: "especialidades", service: specialtyService, Page: SpecialtiesPage },
])("$resource live list", ({ resource, subject, service, Page }) => {
  beforeEach(() => { vi.spyOn(service, "list").mockResolvedValue({ items: [item], total: 1 }); });
  function show() {
    const view = render(<QueryClientProvider client={client}><ToastProvider><Page /></ToastProvider></QueryClientProvider>);
    return { ...view, field: (name: string) => view.container.querySelector(`[name="${name}"]`) as HTMLInputElement };
  }
  it("updates name/activation and limits while retaining search without writes or reference reads", async () => {
    const create = vi.spyOn(service, "create"), update = vi.spyOn(service, "update"), remove = vi.spyOn(service, "remove"), refs = vi.spyOn(service, "listAll");
    show(); await tick(); fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "Fictitious" } }); await tick();
    vi.mocked(service.list).mockResolvedValue({ items: [{ ...item, name: "Fictitious remote", active: false, version: 8 }], total: 105 }); await tick(15010);
    expect(screen.getByText("Fictitious remote")).toBeTruthy(); expect(screen.getByRole("cell", { name: "Nao" })).toBeTruthy();
    expect(screen.getByText(/Exibindo 1 de 105/).textContent).toContain("Limite desta lista: 100");
    expect((screen.getByPlaceholderText(/Buscar por nome/) as HTMLInputElement).value).toBe("Fictitious");
    for (const spy of [create, update, remove, refs]) expect(spy).not.toHaveBeenCalled();
  });
  it.each([404, 409])("preserves fields/version across remote changes and blocks another submission after %s", async status => {
    const update = vi.spyOn(service, "update").mockRejectedValue(failure(status)); const get = vi.spyOn(service, "get").mockRejectedValue(failure(404));
    const view = show(); await tick(); fireEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));
    fireEvent.change(view.field("name"), { target: { value: "Fictitious draft" } });
    if (resource === "procedures") { fireEvent.change(view.field("duration_minutes"), { target: { value: "45" } }); fireEvent.change(view.field("price"), { target: { value: "321,09" } }); }
    vi.mocked(service.list).mockResolvedValue({ items: status === 404 ? [] : [{ ...item, version: 8, active: false }], total: status === 404 ? 0 : 1 }); await tick(15010);
    expect(view.field("name").value).toBe("Fictitious draft"); expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar", exact: true })); await tick();
    expect(update).toHaveBeenCalledWith(item.id, expect.objectContaining({ version: 7, name: "Fictitious draft", active: true }));
    if (resource === "procedures") expect(update).toHaveBeenCalledWith(item.id, expect.objectContaining({ duration_minutes: 45, price_cents: 32109 }));
    expect((screen.getByRole("button", { name: "Salvar", exact: true }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(view.container.querySelector("form")!); await tick(); expect(update).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Descartar rascunho e carregar atual" })); await tick(); expect(view.field("name").value).toBe("Fictitious draft");
  });
  it("keeps stale data/timestamp with 60s backoff; new failed search is not an empty success", async () => {
    show(); await tick(); const stamp = screen.getByText(/Última atualização/).textContent;
    vi.mocked(service.list).mockRejectedValue(failure(503)); await tick(15010);
    expect(screen.getByText(item.name)).toBeTruthy(); expect(screen.getByText(/Os dados exibidos podem estar desatualizados/)).toBeTruthy();
    expect(screen.getByText(/Última atualização/).textContent).toBe(stamp);
    await tick(30000); expect(service.list).toHaveBeenCalledTimes(2);
    vi.mocked(service.list).mockResolvedValue({ items: [], total: 0 }); await tick(30000); expect(screen.getByText(/Nenhum.*encontrad/)).toBeTruthy();
    vi.mocked(service.list).mockRejectedValue(failure(503)); fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "another" } }); await tick();
    expect(screen.queryByText(/Nenhum.*encontrad/)).toBeNull(); expect(screen.getByText(`Não foi possível carregar ${subject}.`)).toBeTruthy();
    vi.mocked(service.list).mockResolvedValue({ items: [item], total: 1 }); fireEvent.click(screen.getByRole("button", { name: `Atualizar ${subject}` })); await tick(); expect(screen.getByText(item.name)).toBeTruthy();
  });
  it("cancels obsolete search and does not accept a late old response", async () => {
    let resolve!: (value: { items: (Procedure & Specialty)[]; total: number }) => void;
    vi.mocked(service.list).mockImplementationOnce(() => new Promise(done => { resolve = done; })); show(); await tick();
    const signal = vi.mocked(service.list).mock.calls[0][1]; vi.mocked(service.list).mockResolvedValue({ items: [], total: 0 });
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "new" } }); await tick(); expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ items: [item], total: 1 })); await tick(); expect(screen.queryByText(item.name)).toBeNull();
  });
  it("does not release deletion review through background refresh", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true); const remove = vi.spyOn(service, "remove").mockRejectedValue(failure(409)); show(); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Excluir", exact: true })); await tick(); expect(remove).toHaveBeenCalledWith(item.id, 7);
    vi.mocked(service.list).mockResolvedValue({ items: [{ ...item, version: 8 }], total: 1 }); await tick(15010);
    expect(screen.getByRole("button", { name: "Recarregar lista para conferir" })).toBeTruthy(); expect((screen.getByRole("button", { name: "Excluir", exact: true }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Recarregar lista para conferir" })); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Excluir", exact: true })); await tick(); expect(remove).toHaveBeenLastCalledWith(item.id, 8);
  });
  it.each([401, 403])("discards list/form on %s without removing unrelated form reference caches", async status => {
    client.setQueryData([resource, "appointments-form"], { items: [item], total: 1 });
    const view = show(); await tick(); fireEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));
    vi.mocked(service.list).mockRejectedValue(failure(status)); await tick(15010);
    expect(screen.getByText(new RegExp(`Seu acesso a ${subject}`))).toBeTruthy(); expect(view.field("name")).toBeNull();
    expect(client.getQueriesData({ queryKey: [resource, "list"] })).toEqual([]);
    expect(client.getQueryData([resource, "appointments-form"])).toEqual({ items: [item], total: 1 });
    await tick(30000); expect(service.list).toHaveBeenCalledTimes(2);
  });
  it("pauses hidden/offline reads and does not overlap a slow request", async () => {
    show(); await tick(); act(() => focusManager.setFocused(false)); await tick(30000); expect(service.list).toHaveBeenCalledTimes(1);
    act(() => focusManager.setFocused(true)); await tick(); expect(service.list).toHaveBeenCalledTimes(2);
    act(() => onlineManager.setOnline(false)); await tick(30000); expect(service.list).toHaveBeenCalledTimes(2);
    vi.mocked(service.list).mockImplementation(() => new Promise(() => {})); act(() => onlineManager.setOnline(true)); await tick();
    await tick(30000); fireEvent(window, new Event("focus")); await tick(); expect(service.list).toHaveBeenCalledTimes(3);
  });
  it("forwards the list AbortSignal to Axios", async () => {
    vi.mocked(service.list).mockRestore(); const get = vi.spyOn(api, "get").mockResolvedValue({ data: { items: [], total: 0 } });
    const signal = new AbortController().signal; await service.list({ limit: 100 }, signal);
    expect(get).toHaveBeenCalledWith(`/api/${resource}`, { params: { limit: 100 }, signal });
  });
});

it("catalog refresh/denial does not change the real agenda form references, selected procedure or entered end time", async () => {
  vi.spyOn(procedureService, "list").mockResolvedValue({ items: [item], total: 1 });
  vi.spyOn(procedureService, "listAll").mockResolvedValue({ items: [item], total: 1 });
  vi.spyOn(patientService, "listAll").mockResolvedValue({ items: [], total: 0 }); vi.spyOn(dentistService, "listAll").mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(appointmentService, "list").mockResolvedValue([]);
  render(<QueryClientProvider client={client}><ToastProvider><div data-testid="catalog"><ProceduresPage /></div><div data-testid="agenda"><AppointmentsPage /></div></ToastProvider></QueryClientProvider>);
  await tick(); const agenda = within(screen.getByTestId("agenda")); fireEvent.click(agenda.getByRole("button", { name: "Nova", exact: true })); await tick();
  const start = screen.getByTestId("agenda").querySelector('[name="start_at"]') as HTMLInputElement;
  const end = screen.getByTestId("agenda").querySelector('[name="end_at"]') as HTMLInputElement;
  fireEvent.change(start, { target: { value: "2030-01-07T10:00" } }); fireEvent.click(agenda.getByRole("checkbox")); await tick();
  expect(end.value).toBe("2030-01-07T10:30"); fireEvent.change(end, { target: { value: "2030-01-07T11:15" } });
  vi.mocked(procedureService.list).mockResolvedValue({ items: [{ ...item, name: "Fictitious remote", duration_minutes: 90, active: false }], total: 1 }); await tick(15010);
  expect(within(screen.getByTestId("catalog")).getByText("Fictitious remote")).toBeTruthy(); expect(end.value).toBe("2030-01-07T11:15");
  expect((agenda.getByRole("checkbox") as HTMLInputElement).checked).toBe(true); expect(agenda.getByText(item.name)).toBeTruthy();
  vi.mocked(procedureService.list).mockRejectedValue(failure(403)); await tick(15010);
  expect(end.value).toBe("2030-01-07T11:15"); expect(procedureService.listAll).toHaveBeenCalledTimes(1);
});
