import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AxiosError } from "axios";
import { UsersPage } from "../src/pages/users/users-page";
import { AppLayout } from "../src/components/layout/app-layout";
import { ToastProvider } from "../src/components/ui/toast";
import { authService, dentistService, userService } from "../src/lib/services";
import type { User } from "../src/types";

vi.mock("../src/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "admin", version: 1, role: "admin" }, logout: vi.fn() }) }));
vi.mock("../src/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true, isLoading: false, isError: false }) }));
vi.mock("../src/hooks/use-theme", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
const user = (version = 1, name = "Fictitious Target"): User => ({ id: "target", version, name, email: "target@example.com",
  role: "reception", dentist_id: null, is_active: true, created_at: "2026-09-28", updated_at: "2026-09-28" });
const failure = (status: number, code = "stale_version") => new AxiosError("failure", "ERR_BAD_RESPONSE", undefined, undefined,
  { status, statusText: "Error", data: { detail: "Revise os dados.", code }, headers: {}, config: {} as never });
let client: QueryClient;
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });
function setup(layout = false) {
  vi.spyOn(userService, "list").mockResolvedValue({ items: [user()], total: 1 });
  vi.spyOn(dentistService, "listAll").mockResolvedValue({ items: [], total: 0 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider>{layout ? <AppLayout /> : <UsersPage />}</ToastProvider></MemoryRouter></QueryClientProvider>);
}
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const field = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const fill = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });

it("keeps captured version and draft through conflict/refetch/failed reload, then requires explicit review", async () => {
  setup(); const update = vi.spyOn(userService, "update").mockRejectedValueOnce(failure(409)).mockResolvedValue(user(4));
  const get = vi.spyOn(userService, "get").mockRejectedValueOnce(failure(503)).mockResolvedValue(user(3, "Fictitious Current"));
  fireEvent.click(await screen.findByRole("button", { name: "Editar" })); fill("name", "Fictitious Draft");
  client.setQueryData(["users", "list", ""], { items: [user(9)], total: 1 });
  fireEvent.click(button("Salvar")); await screen.findByRole("button", { name: "Descartar e carregar atual" });
  expect(update.mock.calls[0][1].version).toBe(1); expect(field("name").value).toBe("Fictitious Draft");
  fireEvent.click(button("Descartar e carregar atual")); await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(button("Descartar e carregar atual").disabled).toBe(false));
  expect(button("Salvar").disabled).toBe(true); expect(field("name").value).toBe("Fictitious Draft");
  fireEvent.click(button("Descartar e carregar atual")); await waitFor(() => expect(field("name").value).toBe("Fictitious Current"));
  expect(update).toHaveBeenCalledTimes(1); fireEvent.click(button("Salvar"));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2)); expect(update.mock.calls[1][1].version).toBe(3);
});

it("clears password fields and mutation variables after conflict and on close/reopen", async () => {
  setup(); const reset = vi.spyOn(userService, "setPassword").mockRejectedValue(failure(409));
  fireEvent.click(await screen.findByRole("button", { name: "Senha" }));
  fill("new_password", "fictitious-transient"); fill("confirm_password", "fictitious-transient");
  fireEvent.click(button("Salvar senha")); await screen.findByRole("button", { name: "Descartar e carregar atual" });
  expect(reset.mock.calls[0][2]).toBe(1); expect(field("new_password").value).toBe("");
  await waitFor(() => expect(JSON.stringify(client.getMutationCache().getAll().map(m => m.state.variables))).not.toContain("fictitious-transient"));
  fireEvent.click(button("Cancelar")); fireEvent.click(button("Senha")); expect(field("new_password").value).toBe("");
});

it("reviewed deletion requires new identity and explicit confirmation after conflict", async () => {
  setup(); const remove = vi.spyOn(userService, "remove").mockRejectedValueOnce(failure(409)).mockResolvedValue(undefined);
  vi.spyOn(userService, "get").mockResolvedValue(user(2, "Fictitious Current"));
  fireEvent.click(await screen.findByRole("button", { name: "Excluir" })); fireEvent.click(button("Confirmar exclusão"));
  await screen.findByRole("button", { name: "Descartar e carregar atual" }); expect(remove).toHaveBeenCalledWith("target", 1);
  expect(button("Confirmar exclusão").disabled).toBe(true); fireEvent.click(button("Descartar e carregar atual"));
  await screen.findByText(/Fictitious Current/); expect(remove).toHaveBeenCalledTimes(1);
  fireEvent.click(button("Confirmar exclusão")); await waitFor(() => expect(remove).toHaveBeenCalledWith("target", 2));
});

it.each([401, 403])("hides data after lost authorization (%s)", async status => {
  setup(); vi.spyOn(userService, "update").mockRejectedValue(failure(status));
  fireEvent.click(await screen.findByRole("button", { name: "Editar" })); fireEvent.click(button("Salvar"));
  await screen.findByText(/Seu acesso à administração/); expect(document.querySelector('input[name="name"]')).toBeNull();
});

it("blocks switching or closing targets while password submission is pending", async () => {
  setup(); let finish!: (value: User) => void;
  vi.spyOn(userService, "setPassword").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(await screen.findByRole("button", { name: "Senha" })); fill("new_password", "fictitious-transient"); fill("confirm_password", "fictitious-transient");
  fireEvent.click(button("Salvar senha")); await waitFor(() => expect(button("Salvando...").disabled).toBe(true));
  fireEvent.click(button("Cancelar")); expect(field("new_password")).not.toBeNull(); finish(user(2));
  await waitFor(() => expect(document.querySelector('input[name="new_password"]')).toBeNull());
});

it("own password loads current identity instead of login version and clears secrets on conflict", async () => {
  vi.spyOn(authService, "me").mockResolvedValue(user(5));
  const change = vi.spyOn(authService, "changePassword").mockRejectedValue(failure(409)); setup(true);
  fireEvent.click(button("Trocar senha")); await waitFor(() => expect(button("Atualizar senha").disabled).toBe(false));
  fill("current_password", "fictitious-original"); fill("new_password", "fictitious-transient"); fill("confirm_new_password", "fictitious-transient");
  fireEvent.click(button("Atualizar senha")); await screen.findByRole("button", { name: "Carregar dados atuais" });
  expect(change.mock.calls[0][0].version).toBe(5); expect(field("new_password").value).toBe("");
  expect(button("Atualizar senha").disabled).toBe(true);
  await waitFor(() => expect(JSON.stringify(client.getMutationCache().getAll().map(m => m.state.variables))).not.toContain("fictitious-transient"));
});

it("own password cannot submit after failed identity load and never retries a mutation automatically", async () => {
  const me = vi.spyOn(authService, "me").mockRejectedValueOnce(failure(503)).mockResolvedValue(user(8));
  const change = vi.spyOn(authService, "changePassword"); setup(true); fireEvent.click(button("Trocar senha"));
  await waitFor(() => expect(button("Carregar dados atuais").disabled).toBe(false)); expect(button("Atualizar senha").disabled).toBe(true);
  fireEvent.click(button("Carregar dados atuais")); await waitFor(() => expect(button("Atualizar senha").disabled).toBe(false));
  expect(me).toHaveBeenCalledTimes(2); expect(change).not.toHaveBeenCalled();
});
