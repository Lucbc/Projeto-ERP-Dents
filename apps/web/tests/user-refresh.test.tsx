import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { UsersPage } from "../src/pages/users/users-page";
import { ToastProvider } from "../src/components/ui/toast";
import { dentistService, userService } from "../src/lib/services";
import { api } from "../src/lib/api";
import type { User } from "../src/types";
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin", role: "admin" }, logout: vi.fn() }) }));
let client: QueryClient;
const item = { id: "11111111-1111-4111-8111-111111111111", name: "Fictitious original", is_active: true, version: 7,
  email: "fictitious@example.com", role: "reception", dentist_id: null } as User;
const failure = (status: number) => new AxiosError("Fictitious error", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "Error", data: { detail: "Fictitious conflict", code: "stale_version" }, headers: {}, config: {} as never });
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, 7, 12)); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined); onlineManager.setOnline(true); vi.useRealTimers(); });

describe("users live list", () => {
  const resource = "users", subject = "usuários", service = userService, Page = UsersPage;
  beforeEach(() => { vi.spyOn(service, "list").mockResolvedValue({ items: [item], total: 1 }); vi.spyOn(dentistService, "listAll").mockResolvedValue({ items: [], total: 0 }); });
  function show() {
    const view = render(<QueryClientProvider client={client}><ToastProvider><Page /></ToastProvider></QueryClientProvider>);
    return { ...view, field: (name: string) => view.container.querySelector(`[name="${name}"]`) as HTMLInputElement };
  }
  it("updates name/activation and limits while retaining search without writes or reference reads", async () => {
    const create = vi.spyOn(service, "create"), update = vi.spyOn(service, "update"), remove = vi.spyOn(service, "remove"), refs = vi.spyOn(dentistService, "listAll");
    show(); await tick(); fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "Fictitious" } }); await tick();
    vi.mocked(service.list).mockResolvedValue({ items: [{ ...item, name: "Fictitious remote", is_active: false, version: 8 }], total: 105 }); await tick(15010);
    expect(screen.getByText("Fictitious remote")).toBeTruthy(); expect(screen.getByRole("cell", { name: "Não" })).toBeTruthy();
    expect(screen.getByText(/Exibindo 1 de 105/).textContent).toContain("Limite desta lista: 100");
    expect((screen.getByPlaceholderText(/Buscar por nome/) as HTMLInputElement).value).toBe("Fictitious");
    for (const spy of [create, update, remove]) expect(spy).not.toHaveBeenCalled(); expect(refs).toHaveBeenCalledTimes(1);
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
    let resolve!: (value: { items: User[]; total: number }) => void;
    vi.mocked(service.list).mockImplementationOnce(() => new Promise(done => { resolve = done; })); show(); await tick();
    const signal = vi.mocked(service.list).mock.calls[0][1]; vi.mocked(service.list).mockResolvedValue({ items: [], total: 0 });
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: "new" } }); await tick(); expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ items: [item], total: 1 })); await tick(); expect(screen.queryByText(item.name)).toBeNull();
  });
  it.each([401, 403])("discards list/form on %s without removing unrelated form reference caches", async status => {
    client.setQueryData([resource, "appointments-form"], { items: [item], total: 1 });
    const view = show(); await tick(); fireEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));
    vi.mocked(service.list).mockRejectedValue(failure(status)); await tick(15010);
    expect(screen.getByText(/Seu acesso à administração de usuários/)).toBeTruthy(); expect(view.field("name")).toBeNull();
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
  it.each(["edit", "password", "delete"])("keeps captured %s identity/version through polling and requires explicit review after conflict", async flow => {
    const update = vi.spyOn(service, "update").mockRejectedValue(failure(409));
    const reset = vi.spyOn(service, "setPassword").mockRejectedValue(failure(409));
    const remove = vi.spyOn(service, "remove").mockRejectedValue(failure(409));
    const current = { ...item, name: "Fictitious remote", version: 8, is_active: false };
    vi.spyOn(service, "get").mockResolvedValue(current);
    const view = show(); await tick();
    fireEvent.click(screen.getByRole("button", { name: flow === "edit" ? "Editar" : flow === "password" ? "Senha" : "Excluir", exact: true }));
    const transient = crypto.randomUUID();
    if (flow === "edit") fireEvent.change(view.field("name"), { target: { value: "Fictitious draft" } });
    if (flow === "password") for (const name of ["new_password", "confirm_password"]) fireEvent.change(view.field(name), { target: { value: transient } });
    vi.mocked(service.list).mockResolvedValue({ items: [current], total: 1 }); await tick(15010);
    expect(screen.getByRole("cell", { name: current.name })).toBeTruthy();
    if (flow === "edit") expect(view.field("name").value).toBe("Fictitious draft");
    else expect(screen.getByText(/Fictitious original —/)).toBeTruthy();
    if (flow === "password") expect(view.field("new_password").value === transient).toBe(true);
    const submit = flow === "edit" ? "Salvar" : flow === "password" ? "Salvar senha" : "Confirmar exclusão";
    fireEvent.click(screen.getByRole("button", { name: submit, exact: true })); await tick();
    const mutation = flow === "edit" ? update : flow === "password" ? reset : remove;
    expect(mutation).toHaveBeenCalledTimes(1);
    if (flow === "edit") expect(update.mock.calls[0][1]).toMatchObject({ version: 7, name: "Fictitious draft" });
    if (flow === "password") { expect(reset.mock.calls[0][2]).toBe(7); expect(view.field("new_password").value).toBe(""); }
    if (flow === "delete") expect(remove).toHaveBeenCalledWith(item.id, 7);
    await tick(15010); expect((screen.getByRole("button", { name: submit, exact: true }) as HTMLButtonElement).disabled).toBe(true);
    expect(mutation).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Descartar e carregar atual" })); await tick();
    expect((screen.getByRole("button", { name: submit, exact: true }) as HTMLButtonElement).disabled).toBe(false);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(client.getMutationCache().getAll().map(m => m.state.variables)).includes(transient)).toBe(false);
  });
  it.each(["create", "password"])("retains %s secret only in the open form across refresh and clears it on read denial", async flow => {
    const view = show(); await tick(); fireEvent.click(screen.getByRole("button", { name: flow === "create" ? "Novo" : "Senha", exact: true }));
    const name = flow === "create" ? "password" : "new_password", transient = crypto.randomUUID();
    fireEvent.change(view.field(name), { target: { value: transient } }); await tick(15010);
    expect(view.field(name).value === transient).toBe(true);
    expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data)).includes(transient)).toBe(false);
    vi.mocked(service.list).mockRejectedValue(failure(403)); await tick(15010);
    expect(view.field(name)).toBeNull(); expect(client.getQueriesData({ queryKey: ["users", "list"] })).toEqual([]);
    expect(JSON.stringify(client.getMutationCache().getAll().map(m => m.state.variables)).includes(transient)).toBe(false);
  });
  it("late explicit reload cannot reopen a form after list permission is revoked", async () => {
    vi.spyOn(service, "update").mockRejectedValue(failure(409)); let resolve!: (value: User) => void;
    vi.spyOn(service, "get").mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = show(); await tick(); fireEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar", exact: true })); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Descartar e carregar atual" })); await tick();
    vi.mocked(service.list).mockRejectedValue(failure(403)); await tick(15010);
    await act(async () => resolve({ ...item, version: 8 })); await tick();
    expect(view.field("name")).toBeNull(); expect(screen.getByText(/Seu acesso à administração/)).toBeTruthy();
    expect(client.getQueriesData({ queryKey: ["users", "list"] })).toEqual([]);
  });
});
