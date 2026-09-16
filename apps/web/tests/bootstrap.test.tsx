import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { LoginPage } from "../src/pages/login-page";
import { ToastProvider } from "../src/components/ui/toast";
import { api } from "../src/lib/api";
import { changeSession } from "../src/lib/session";

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, login }) }));
let pending = true;
let postStatus = 200;
let failStatusAfterCreation = false;
let posted: InternalAxiosRequestConfig[] = [];
let client: QueryClient;

beforeEach(() => {
  pending = true;
  postStatus = 200;
  failStatusAfterCreation = false;
  posted = [];
  login.mockReset().mockResolvedValue(undefined);
  changeSession(null);
  api.defaults.adapter = async (config) => {
    const response = { config, status: 200, statusText: "OK", headers: {}, data: {} };
    if (config.url === "/api/auth/needs-bootstrap") {
      if (failStatusAfterCreation && !pending) throw new AxiosError("Network Error", "ERR_NETWORK", config);
      return { ...response, data: { needsBootstrap: pending } };
    }
    posted.push(config);
    if (postStatus === 409) pending = false;
    if (postStatus !== 200) throw new AxiosError("Rejected", "ERR_BAD_REQUEST", config, undefined,
      { ...response, status: postStatus, data: { detail: "Ativação rejeitada." } });
    pending = false;
    return { ...response, data: { id: "fictitious-admin" } };
  };
});
afterEach(() => { cleanup(); client?.clear(); });

function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider><LoginPage /></ToastProvider></QueryClientProvider>);
}
async function fill(code = "fictitious-activation-code-for-tests-only") {
  const form = within(await screen.findByRole("form", { name: "Configuração inicial" }));
  fireEvent.change(form.getByLabelText("Código de ativação"), { target: { value: code } });
  fireEvent.change(form.getByLabelText("Nome"), { target: { value: "Initial Test Admin" } });
  fireEvent.change(form.getByLabelText("E-mail"), { target: { value: "initial@example.com" } });
  fireEvent.change(form.getByLabelText("Senha", { exact: true }), { target: { value: "fictitious-password" } });
  fireEvent.change(form.getByLabelText("Confirmar senha"), { target: { value: "fictitious-password" } });
  fireEvent.click(form.getByRole("button", { name: "Criar administrador" }));
}

it("hides setup on initialized installations and omits endpoint implementation text", async () => {
  pending = false; mount();
  await waitFor(() => expect(client.getQueryData(["auth", "needs-bootstrap"])).toEqual({ needsBootstrap: false }));
  expect(screen.queryByText("Criar administrador inicial")).toBeNull();
  expect(screen.queryByText(/needs-bootstrap/)).toBeNull();
  expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
});

it("requires the activation code before sending initial registration", async () => {
  mount(); await fill("");
  await screen.findByText("Informe o código de ativação do servidor.");
  expect(posted).toHaveLength(0);
});

it("sends activation only in the header, closes setup and logs in after creation", async () => {
  mount(); await fill();
  await waitFor(() => expect(login).toHaveBeenCalledWith("initial@example.com", "fictitious-password"));
  expect(posted).toHaveLength(1);
  expect(posted[0].headers["X-Bootstrap-Token"]).toBe("fictitious-activation-code-for-tests-only");
  expect(JSON.parse(posted[0].data)).toEqual({ name: "Initial Test Admin", email: "initial@example.com", password: "fictitious-password" });
  expect(screen.queryByLabelText("Código de ativação")).toBeNull();
});

it("keeps setup available after a rejected code without attempting login", async () => {
  postStatus = 403; mount(); await fill();
  await screen.findByText("Ativação rejeitada.");
  expect(screen.getByLabelText("Código de ativação")).toBeTruthy();
  expect(login).not.toHaveBeenCalled();
});

it("refreshes setup status after another client completed registration", async () => {
  postStatus = 409; mount(); await fill();
  await waitFor(() => expect(screen.queryByLabelText("Código de ativação")).toBeNull());
  expect(login).not.toHaveBeenCalled();
});

it("does not reopen setup when creation succeeds but status refresh and login fail", async () => {
  failStatusAfterCreation = true;
  login.mockRejectedValue(new Error("Connection unavailable"));
  mount(); await fill();
  await screen.findByText("Administrador criado. Faça login para continuar.");
  expect(screen.queryByLabelText("Código de ativação")).toBeNull();
  expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
});
