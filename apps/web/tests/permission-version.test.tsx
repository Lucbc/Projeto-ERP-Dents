import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { PermissionsPage } from "../src/pages/permissions/permissions-page";
import { ToastProvider } from "../src/components/ui/toast";
import { permissionService } from "../src/lib/services";
import type { RolePermission, UserRole } from "../src/types";

let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
const item = (role: UserRole, version = 1, view = false): RolePermission => ({
  role, version, permissions: { patients: { view, create: false, update: false, delete: false } },
});
const rows = () => ({ items: [item("coordinator"), item("dentist"), item("reception")] });
const failure = (status: number, code?: string) => new AxiosError("failure", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "Error", data: { detail: "Revise as permissões.", code }, headers: {}, config: {} as never });
function setup(data = rows()) {
  const list = vi.spyOn(permissionService, "list").mockResolvedValue(data);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ToastProvider><PermissionsPage /></ToastProvider></QueryClientProvider>);
  return list;
}
async function open(role: string) { fireEvent.click(await screen.findByRole("button", { name: new RegExp(role) })); }
const checkbox = (role: string) => screen.getByRole("checkbox", { name: new RegExp(`${role}: Pacientes.*Ver`) }) as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "Salvar Permissões" }) as HTMLButtonElement;

it("saving one profile and background refetch preserve another profile draft and its original version", async () => {
  setup();
  const update = vi.spyOn(permissionService, "update").mockImplementation(async (role, payload) => ({ role, ...payload, version: payload.version + 1 }));
  await open("Coordenador"); fireEvent.click(checkbox("Coordenador"));
  await open("Recepcao"); fireEvent.click(checkbox("Recepcao")); fireEvent.click(save());
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(save().disabled).toBe(false));
  client.setQueryData(["permissions", "roles"], { items: [item("coordinator", 9), item("dentist"), item("reception", 2, true)] });
  await open("Coordenador"); expect(checkbox("Coordenador").checked).toBe(true);
  fireEvent.click(save());
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1].version).toBe(1);
  expect(update.mock.calls[1][1].permissions.patients.view).toBe(true);
});

it("conflict and failed reload keep draft blocked; explicit successful reload never autosaves", async () => {
  const list = setup();
  const update = vi.spyOn(permissionService, "update").mockRejectedValueOnce(failure(409, "stale_version"))
    .mockResolvedValue(item("reception", 4, true));
  await open("Recepcao"); fireEvent.click(checkbox("Recepcao")); fireEvent.click(save());
  const reload = await screen.findByRole("button", { name: "Descartar rascunho e carregar atual" });
  expect(checkbox("Recepcao").checked).toBe(true); expect(save().disabled).toBe(true);
  list.mockRejectedValueOnce(failure(503)); fireEvent.click(reload);
  await waitFor(() => expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect(checkbox("Recepcao").checked).toBe(true); expect(save().disabled).toBe(true);
  list.mockResolvedValueOnce({ items: [item("reception", 3)] }); fireEvent.click(reload);
  await waitFor(() => expect(save().disabled).toBe(false));
  expect(checkbox("Recepcao").checked).toBe(false); expect(update).toHaveBeenCalledTimes(1);
  fireEvent.click(checkbox("Recepcao")); fireEvent.click(save());
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][1].version).toBe(3);
});

it.each([401, 403])("hides cached matrices after access loss (%s)", async (status) => {
  setup(); vi.spyOn(permissionService, "update").mockRejectedValue(failure(status));
  await open("Recepcao"); fireEvent.click(save());
  await screen.findByText(/Seu acesso à administração/);
  expect(screen.queryByRole("checkbox")).toBeNull();
});

it("ambiguous server failure requires review, while validation error keeps draft editable", async () => {
  setup(); const update = vi.spyOn(permissionService, "update").mockRejectedValueOnce(failure(400)).mockRejectedValueOnce(failure(503));
  await open("Recepcao"); fireEvent.click(checkbox("Recepcao")); fireEvent.click(save());
  await screen.findByText("Revise as permissões."); await waitFor(() => expect(save().disabled).toBe(false));
  expect(checkbox("Recepcao").checked).toBe(true); fireEvent.click(save());
  await screen.findByRole("button", { name: "Descartar rascunho e carregar atual" }); expect(save().disabled).toBe(true);
});

it("sends virtual version zero explicitly for the first save", async () => {
  setup({ items: [item("reception", 0)] });
  const update = vi.spyOn(permissionService, "update").mockResolvedValue(item("reception", 1));
  await open("Recepcao"); fireEvent.click(save());
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(update.mock.calls[0][1].version).toBe(0);
});

it("removes cached matrices when background refresh loses access", async () => {
  const list = setup(); await open("Recepcao");
  list.mockRejectedValue(failure(403));
  await client.invalidateQueries({ queryKey: ["permissions", "roles"] });
  await screen.findByText(/Seu acesso à administração/);
  expect(screen.queryByRole("checkbox")).toBeNull();
});
