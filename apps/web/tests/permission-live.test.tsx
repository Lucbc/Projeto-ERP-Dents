import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { PermissionsPage } from "../src/pages/permissions/permissions-page";
import { ToastProvider } from "../src/components/ui/toast";
import { permissionService } from "../src/lib/services";
import type { RolePermission, UserRole } from "../src/types";

let client: QueryClient;
const item = (role: UserRole, version = 1, view = false): RolePermission => ({ role, version,
  permissions: { patients: { view, create: false, update: false, delete: false } } });
const rows = (version = 1, view = false) => ({ items: [item("coordinator", version, view), item("reception", version, view)] });
const failure = (status: number) => new AxiosError("Fictitious", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, data: {}, headers: {}, statusText: "Error", config: {} as never });
const tick = async (ms = 10) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
beforeEach(() => { vi.useFakeTimers(); focusManager.setFocused(true); onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); focusManager.setFocused(undefined);
  onlineManager.setOnline(true); vi.useRealTimers(); });
function mount() { return render(<QueryClientProvider client={client}><ToastProvider><PermissionsPage /></ToastProvider></QueryClientProvider>); }
function open(role: string) { fireEvent.click(screen.getByRole("button", { name: new RegExp(role) })); }
const field = (role: string) => screen.getByRole("checkbox", { name: new RegExp(`${role}: Pacientes.*Ver`) }) as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "Salvar Permissões" }) as HTMLButtonElement;
const reload = () => screen.getByRole("button", { name: "Descartar rascunho e carregar atual" });

it("observes remote versions, preserves closed drafts and reloads only the selected role without writes", async () => {
  const list = vi.spyOn(permissionService, "list").mockResolvedValue(rows());
  const update = vi.spyOn(permissionService, "update").mockImplementation(async (role, data) => ({ role, ...data, version: data.version + 1 }));
  mount(); await tick(); open("Coordenador"); fireEvent.click(field("Coordenador"));
  open("Recepcao"); fireEvent.click(field("Recepcao")); list.mockResolvedValue(rows(2));
  await tick(15_010); expect(list).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/Coordenador: há uma versão mais recente/)).toBeTruthy();
  expect(field("Recepcao").checked).toBe(true); expect(update).not.toHaveBeenCalled();
  fireEvent.click(reload()); await tick(); expect(field("Recepcao").checked).toBe(false);
  expect(screen.queryByText(/Recepcao: há uma versão mais recente/)).toBeNull();
  open("Coordenador"); expect(field("Coordenador").checked).toBe(true);
  fireEvent.click(save()); await tick(); expect(update.mock.calls[0][1].version).toBe(1);
  open("Recepcao"); fireEvent.click(save()); await tick(); expect(update.mock.calls[1][1].version).toBe(2);
});

it("identifies initial and stale failures, backs off to 60 seconds and preserves drafts on recovery", async () => {
  const list = vi.spyOn(permissionService, "list").mockRejectedValueOnce(failure(503)).mockResolvedValue(rows());
  mount(); await tick(); expect(screen.getByText("Não foi possível carregar permissões.")).toBeTruthy();
  expect(screen.queryByText("Nenhuma permissão cadastrada.")).toBeNull();
  await tick(30_000); expect(list).toHaveBeenCalledTimes(1); await tick(30_010);
  open("Recepcao"); fireEvent.click(field("Recepcao")); list.mockRejectedValueOnce(failure(503));
  await tick(15_010); expect(screen.getByText(/Os dados exibidos podem estar desatualizados/)).toBeTruthy();
  expect(field("Recepcao").checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Atualizar permissões" })); await tick();
  expect(field("Recepcao").checked).toBe(true);
});

it("polling after an uncertain save cannot unlock review or replace the captured draft", async () => {
  const list = vi.spyOn(permissionService, "list").mockResolvedValue(rows());
  const update = vi.spyOn(permissionService, "update").mockRejectedValue(failure(503));
  mount(); await tick(); open("Recepcao"); fireEvent.click(field("Recepcao")); fireEvent.click(save()); await tick();
  expect(save().disabled).toBe(true); list.mockResolvedValue(rows(3)); await tick(15_010);
  expect(save().disabled).toBe(true); expect(field("Recepcao").checked).toBe(true);
  expect(update).toHaveBeenCalledTimes(1); fireEvent.click(reload()); await tick();
  expect(save().disabled).toBe(false); expect(field("Recepcao").checked).toBe(false);
  expect(update).toHaveBeenCalledTimes(1);
});

it("pauses hidden/offline reads and cancels a slow read on unmount without overlapping it", async () => {
  const list = vi.spyOn(permissionService, "list").mockResolvedValue(rows()); const view = mount(); await tick();
  act(() => focusManager.setFocused(false)); await tick(45_000); expect(list).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(true)); await tick(); expect(list).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(false)); await tick(45_000); expect(list).toHaveBeenCalledTimes(2);
  let signal: AbortSignal | undefined;
  list.mockImplementation(s => { signal = s; return new Promise(() => {}); });
  act(() => onlineManager.setOnline(true)); await tick(); await tick(45_000);
  act(() => window.dispatchEvent(new Event("focus"))); await tick(); expect(list).toHaveBeenCalledTimes(3);
  view.unmount(); expect(signal?.aborted).toBe(true);
});

it.each([401, 403])("denial %s clears only administrative matrices and aborts explicit reloads, ignoring late results", async status => {
  const list = vi.spyOn(permissionService, "list").mockResolvedValue(rows());
  const effective = item("admin"); client.setQueryData(["permissions", "me", "fictitious"], effective);
  mount(); await tick(); open("Recepcao");
  list.mockResolvedValue(rows(2)); await tick(15_010);
  let finish!: (data: ReturnType<typeof rows>) => void; let signal: AbortSignal | undefined;
  list.mockImplementationOnce(s => { signal = s; return new Promise(resolve => { finish = resolve; }); });
  fireEvent.click(reload()); await tick(); list.mockRejectedValue(failure(status)); await tick(15_010);
  expect(screen.getByText(/Seu acesso à administração/)).toBeTruthy(); expect(signal?.aborted).toBe(true);
  await act(async () => finish(rows(3, true))); await tick(60_010);
  expect(screen.queryByRole("checkbox")).toBeNull(); expect(client.getQueryData(["permissions", "roles"])).toBeUndefined();
  expect(client.getQueryData(["permissions", "me", "fictitious"])).toEqual(effective);
  expect(screen.queryByText("Permissões atuais carregadas. Revise antes de salvar.")).toBeNull();
});
