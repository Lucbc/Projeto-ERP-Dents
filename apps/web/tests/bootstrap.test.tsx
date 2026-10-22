import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { LoginPage } from "../src/pages/login-page";
import { ToastProvider } from "../src/components/ui/toast";
import { api, sessionTransport } from "../src/lib/api";
import { changeSession } from "../src/lib/session";

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, login }) }));
let pending = true;
let postStatus = 200;
let failStatusAfterCreation = false;
let posted: InternalAxiosRequestConfig[] = [];
let client: QueryClient;

beforeEach(() => {
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    request: async (_name: string, work: () => Promise<unknown>) => await work(),
  } });
  sessionTransport.defaults.adapter = async (config) => {
    if (config.url === "/api/auth/challenge") return { config, status: 200, statusText: "OK", headers: {}, data: { csrf_token: "fictitious-csrf" } };
    return (api.defaults.adapter as (config: InternalAxiosRequestConfig) => Promise<any>)(config);
  };
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
afterEach(() => { cleanup(); client?.clear(); onlineManager.setOnline(true); vi.restoreAllMocks(); });

function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider><LoginPage /></ToastProvider></QueryClientProvider>);
}
it('offers explicit access lookup after network failure without resending the password', async () => {
  pending = false;
  login.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
  const view = mount();
  await waitFor(() => expect(client.getQueryData(['auth', 'needs-bootstrap'])).toEqual({ needsBootstrap: false }));
  fireEvent.change(view.container.querySelector('[name=email]')!, { target: { value: 'test@example.com' } });
  fireEvent.change(view.container.querySelector('[name=password]')!, { target: { value: 'fictitious-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  await screen.findByRole('button', { name: 'Conferir acesso' });
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({ config, status: 200,
    statusText: 'OK', headers: {}, data: { session_id: null, user: null } }));
  sessionTransport.defaults.adapter = adapter;
  expect(adapter).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Conferir acesso' }));
  await screen.findByText(/Nenhum acesso confirmado/);
  expect(login).toHaveBeenCalledTimes(1);
  expect(adapter).toHaveBeenCalledTimes(1);
  fireEvent.change(view.container.querySelector('[name=email]')!, { target: { value: 'other@example.com' } });
  expect(screen.queryByRole('button', { name: 'Conferir acesso' })).toBeNull();
});

it('does not offer session recovery for a rejected password', async () => {
  pending = false;
  login.mockRejectedValue(new AxiosError('Rejected', 'ERR_BAD_REQUEST', undefined, undefined,
    { status: 401, statusText: 'Unauthorized', headers: {}, config: {} as InternalAxiosRequestConfig,
      data: { detail: 'Credenciais inválidas.' } }));
  const view = mount();
  await waitFor(() => expect(client.getQueryData(['auth', 'needs-bootstrap'])).toEqual({ needsBootstrap: false }));
  fireEvent.change(view.container.querySelector('[name=email]')!, { target: { value: 'test@example.com' } });
  fireEvent.change(view.container.querySelector('[name=password]')!, { target: { value: 'fictitious-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  await screen.findByText('Credenciais inválidas.');
  expect(screen.queryByRole('button', { name: 'Conferir acesso' })).toBeNull();
});
async function fill(code = "fictitious-activation-code-for-tests-only", password = "fictitious-password") {
  const form = within(await screen.findByRole("form", { name: "Configuração inicial" }));
  fireEvent.change(form.getByLabelText("Código de ativação"), { target: { value: code } });
  fireEvent.change(form.getByLabelText("Nome"), { target: { value: "Initial Test Admin" } });
  fireEvent.change(form.getByLabelText("E-mail"), { target: { value: "initial@example.com" } });
  fireEvent.change(form.getByLabelText("Senha", { exact: true }), { target: { value: password } });
  fireEvent.change(form.getByLabelText("Confirmar senha"), { target: { value: password } });
  fireEvent.click(form.getByRole("button", { name: "Criar administrador" }));
}

it("does not queue offline login and requires another explicit submit after reconnecting", async () => {
  pending=false;
  const view=mount();
  await waitFor(()=>expect(client.getQueryData(["auth","needs-bootstrap"])).toEqual({needsBootstrap:false}));
  fireEvent.change(view.container.querySelector('[name=email]')!,{target:{value:'offline@example.com'}});
  fireEvent.change(view.container.querySelector('[name=password]')!,{target:{value:'fictitious-password'}});
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  onlineManager.setOnline(false);
  fireEvent.click(screen.getByRole('button',{name:'Entrar',exact:true}));
  await screen.findByText(/Nada foi enfileirado/);
  expect(login).not.toHaveBeenCalled();
  expect((screen.getByRole('button',{name:'Entrar',exact:true}) as HTMLButtonElement).disabled).toBe(false);
  online.mockReturnValue(true); onlineManager.setOnline(true);
  await client.resumePausedMutations();
  expect(login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Entrar',exact:true}));
  await waitFor(()=>expect(login).toHaveBeenCalledTimes(1));
});

it("does not queue offline initial setup or auto-create an administrator after reconnecting", async () => {
  mount(); await screen.findByRole('form',{name:'Configuração inicial'});
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  onlineManager.setOnline(false);
  await fill();
  await screen.findByText(/Nada foi enfileirado/);
  expect(posted).toHaveLength(0);
  online.mockReturnValue(true); onlineManager.setOnline(true);
  await client.resumePausedMutations();
  expect(posted).toHaveLength(0);
  expect(login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Criar administrador',exact:true}));
  await waitFor(()=>expect(posted).toHaveLength(1));
});

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

it("rejects new passwords over the supported limit before sending them", async () => {
  mount(); await fill(undefined, "x".repeat(129));
  expect((await screen.findAllByText("Maximo de 128 caracteres.")).length).toBeGreaterThan(0);
  expect(posted).toHaveLength(0);
});

it("counts Unicode characters consistently with the server", async () => {
  mount(); await fill(undefined, "😀".repeat(128));
  await waitFor(() => expect(login).toHaveBeenCalled());
  expect(posted).toHaveLength(1);
});

it("keeps setup open after throttling without attempting login", async () => {
  postStatus = 429; mount(); await fill();
  await screen.findByText("Ativação rejeitada.");
  expect(screen.getByLabelText("Código de ativação")).toBeTruthy();
  expect(login).not.toHaveBeenCalled();
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
  expect(screen.getByText(/Se outra pessoa fez a configuração/)).toBeTruthy();
});

it.each([false, true])('confirms unknown setup explicitly without resending secrets (committed=%s)', async (committed) => {
  const original = api.defaults.adapter as (config: InternalAxiosRequestConfig) => Promise<any>;
  api.defaults.adapter = async config => {
    if (config.url === '/api/auth/bootstrap-admin') {
      posted.push(config);
      if (committed) pending = false;
      throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    }
    return original(config);
  };
  mount(); await fill();
  await screen.findByRole('button', { name: 'Conferir configuração' });
  expect((screen.getByRole('button', { name: 'Criar administrador' }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(client.getMutationCache().findAll({ mutationKey: ['auth', 'bootstrap-admin'] })).toHaveLength(0));
  expect(posted).toHaveLength(1);
  expect(login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Conferir configuração' }));
  if (committed) {
    await screen.findByText(/A configuração já foi concluída/);
    expect(screen.queryByLabelText('Código de ativação')).toBeNull();
  } else {
    await screen.findByText(/A configuração ainda está disponível/);
    expect((screen.getByRole('button', { name: 'Criar administrador' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('Código de ativação') as HTMLInputElement).value).toBe('fictitious-activation-code-for-tests-only');
  }
  expect(posted).toHaveLength(1);
  expect(login).not.toHaveBeenCalled();
});

it('keeps creation blocked when confirmation fails and permits a later explicit lookup', async () => {
  const original = api.defaults.adapter as (config: InternalAxiosRequestConfig) => Promise<any>;
  let failLookup = false;
  api.defaults.adapter = async config => {
    if (config.url === '/api/auth/bootstrap-admin') {
      posted.push(config); pending = false; failLookup = true;
      throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    }
    if (config.url === '/api/auth/needs-bootstrap' && failLookup) throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    return original(config);
  };
  mount(); await fill();
  fireEvent.click(await screen.findByRole('button', { name: 'Conferir configuração' }));
  await waitFor(() => expect(client.getMutationCache().getAll().some(mutation => mutation.state.status === 'error')).toBe(true));
  expect((screen.getByRole('button', { name: 'Criar administrador' }) as HTMLButtonElement).disabled).toBe(true);
  failLookup = false;
  fireEvent.click(screen.getByRole('button', { name: 'Conferir configuração' }));
  await screen.findByText(/A configuração já foi concluída/);
  expect(posted).toHaveLength(1);
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
