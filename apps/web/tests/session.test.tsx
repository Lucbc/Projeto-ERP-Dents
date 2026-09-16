import React, { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/hooks/use-auth";
import { api } from "../src/lib/api";
import { changeSession, getSession, TOKEN_STORAGE_KEY } from "../src/lib/session";

const tokenA = "fictitious-session-a";
const tokenB = "fictitious-session-b";
const clients: QueryClient[] = [];
const seen: string[] = [];
function response(config: InternalAxiosRequestConfig, data: unknown) {
  return { config, data, status: 200, statusText: "OK", headers: {} };
}
function httpError(config: InternalAxiosRequestConfig, status: number) {
  return new AxiosError("HTTP test failure", "ERR_BAD_RESPONSE", config, undefined,
    { ...response(config, {}), status });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function Page() {
  const { user, logout, login } = useAuth();
  const client = useQueryClient();
  if (!clients.includes(client)) clients.push(client);
  const [draft, setDraft] = useState("");
  // Deliberately identical key: isolation must hold for every page, even without user ID.
  const query = useQuery({ queryKey: ["patients"], queryFn: async () => (await api.get("/api/patients")).data,
    enabled: Boolean(user) });
  if (!user) return <button onClick={() => void login("b@example.com", "fictitious")}>Login B</button>;
  seen.push(`${user.id}:${query.data ?? "empty"}`);
  return <><p>{user.id}</p><p>{query.data}</p><input aria-label="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
    <button onClick={logout}>Logout</button></>;
}
function mount() { return render(<StrictMode><AuthProvider><Page /></AuthProvider></StrictMode>); }

beforeEach(() => {
  changeSession(null);
  clients.length = 0;
  seen.length = 0;
  api.defaults.adapter = async (config) => {
    const id = config.headers.Authorization === `Bearer ${tokenA}` ? "user-a" : "user-b";
    if (config.url === "/api/auth/me") return response(config, { id, role: "dentist" });
    if (config.url === "/api/auth/login") return response(config, { access_token: tokenB, user: { id } });
    return response(config, `patients-${id}`);
  };
});
afterEach(() => { cleanup(); changeSession(null); vi.useRealTimers(); });

describe("session boundaries", () => {
  it("keeps the session when the current password is incorrect during a change", async () => {
    changeSession(tokenA);
    api.defaults.adapter = async (config) => { throw httpError(config, 400); };
    await expect(api.post("/api/auth/change-password", {})).rejects.toBeInstanceOf(AxiosError);
    expect(getSession().token).toBe(tokenA);
  });

  it("waits for server logout confirmation and hides private data while waiting", async () => {
    const adapter = api.defaults.adapter as (config: InternalAxiosRequestConfig) => Promise<any>;
    const pending = deferred<ReturnType<typeof response>>();
    let logoutConfig!: InternalAxiosRequestConfig;
    api.defaults.adapter = (config) => {
      if (config.url === "/api/auth/logout") { logoutConfig = config; return pending.promise; }
      return adapter(config);
    };
    changeSession(tokenA); mount(); await screen.findByText("patients-user-a");
    fireEvent.click(screen.getByText("Logout"));
    await screen.findByText("Encerrando sessão no servidor...");
    expect(screen.queryByText("patients-user-a")).toBeNull();
    expect(getSession().token).toBe(tokenA);
    expect(logoutConfig.headers.Authorization).toBe(`Bearer ${tokenA}`);
    await act(async () => pending.resolve(response(logoutConfig, {})));
    await screen.findByText("Login B");
    expect(getSession().token).toBeNull();
  });

  it("offers retry after failed logout without claiming server revocation", async () => {
    const adapter = api.defaults.adapter as (config: InternalAxiosRequestConfig) => Promise<any>;
    let fail = true;
    api.defaults.adapter = async (config) => {
      if (config.url === "/api/auth/logout" && fail) throw new AxiosError("Network Error", "ERR_NETWORK", config);
      return adapter(config);
    };
    changeSession(tokenA); mount(); await screen.findByText("patients-user-a");
    fireEvent.click(screen.getByText("Logout"));
    await screen.findByText("Tentar sair novamente");
    expect(screen.queryByText("patients-user-a")).toBeNull();
    expect(getSession().token).toBe(tokenA);
    fail = false;
    fireEvent.click(screen.getByText("Tentar sair novamente"));
    await screen.findByText("Login B");
    expect(getSession().token).toBeNull();
  });

  it("does not end a newer session when an older logout response arrives", async () => {
    const adapter = api.defaults.adapter as (config: InternalAxiosRequestConfig) => Promise<any>;
    const pending = deferred<ReturnType<typeof response>>();
    let logoutConfig!: InternalAxiosRequestConfig;
    api.defaults.adapter = (config) => {
      if (config.url === "/api/auth/logout") { logoutConfig = config; return pending.promise; }
      return adapter(config);
    };
    changeSession(tokenA); mount(); await screen.findByText("patients-user-a");
    fireEvent.click(screen.getByText("Logout"));
    act(() => changeSession(tokenB));
    await screen.findByText("patients-user-b");
    await act(async () => pending.resolve(response(logoutConfig, {})));
    expect(getSession().token).toBe(tokenB);
    expect(screen.getByText("patients-user-b")).toBeTruthy();
  });

  it("logs out and logs in without reloading, clearing cache, mutation cache and drafts", async () => {
    changeSession(tokenA); mount();
    await screen.findByText("patients-user-a");
    const old = clients.at(-1)!;
    old.getMutationCache().build(old, { mutationFn: async () => "old" });
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "private draft A" } });
    fireEvent.click(screen.getByText("Logout"));
    fireEvent.click(await screen.findByText("Login B"));
    await screen.findByText("patients-user-b");
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("");
    expect(seen).not.toContain("user-b:patients-user-a");
    expect(old.getQueryCache().getAll()).toHaveLength(0);
    expect(old.getMutationCache().getAll()).toHaveLength(0);
    expect(clients.at(-1)).not.toBe(old);
  });

  it("adopts another tab login and logout, resetting visible data", async () => {
    changeSession(tokenA); mount(); await screen.findByText("patients-user-a");
    act(() => {
      localStorage.setItem(TOKEN_STORAGE_KEY, tokenB);
      window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_STORAGE_KEY, storageArea: localStorage }));
    });
    await screen.findByText("patients-user-b");
    expect(seen).not.toContain("user-b:patients-user-a");
    act(() => {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_STORAGE_KEY, storageArea: localStorage }));
    });
    await screen.findByText("Login B");
    expect(screen.queryByText("patients-user-b")).toBeNull();
  });

  it("cancels requests and rejects late responses from the previous session", async () => {
    changeSession(tokenA);
    const pending = deferred<ReturnType<typeof response>>();
    let captured!: InternalAxiosRequestConfig;
    api.defaults.adapter = (config) => { captured = config; return pending.promise; };
    const request = api.get("/api/patients").catch((e) => e);
    changeSession(tokenB);
    expect(captured.signal?.aborted).toBe(true);
    pending.resolve(response(captured, "private A"));
    expect(axios.isCancel(await request)).toBe(true);
    expect(getSession().token).toBe(tokenB);
  });

  it("does not let a late 401 log out a newer session, even before storage event delivery", async () => {
    changeSession(tokenA);
    const pending = deferred<ReturnType<typeof response>>();
    let captured!: InternalAxiosRequestConfig;
    api.defaults.adapter = (config) => { captured = config; return pending.promise; };
    const request = api.get("/api/patients").catch((e) => e);
    localStorage.setItem(TOKEN_STORAGE_KEY, tokenB);
    pending.reject(httpError(captured, 401));
    expect(axios.isCancel(await request)).toBe(true);
    expect(getSession().token).toBe(tokenB);
  });

  it("a current authenticated 401 ends the session and removes private UI", async () => {
    changeSession(tokenA); mount(); await screen.findByText("patients-user-a");
    api.defaults.adapter = async (config) => { throw httpError(config, 401); };
    await act(async () => { await api.get("/api/protected").catch(() => undefined); });
    await screen.findByText("Login B");
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.queryByText("patients-user-a")).toBeNull();
  });

  it.each([403, 500, 0])("does not delete credentials on HTTP/network failure %s", async (status) => {
    changeSession(tokenA);
    api.defaults.adapter = async (config) => { throw status ? httpError(config, status) : new AxiosError("Network Error", "ERR_NETWORK", config); };
    await api.get("/api/patients").catch(() => undefined);
    expect(getSession().token).toBe(tokenA);
  });

  it("login 401 has no bearer and does not invalidate an existing session", async () => {
    changeSession(tokenA);
    api.defaults.adapter = async (config) => {
      expect(config.headers.Authorization).toBeUndefined();
      throw httpError(config, 401);
    };
    await api.post("/api/auth/login", {}).catch(() => undefined);
    expect(getSession().token).toBe(tokenA);
  });

  it.each(["manual", "online"])("retains saved access during validation failure and recovers via %s", async (mode) => {
    changeSession(tokenA);
    const healthy = api.defaults.adapter;
    api.defaults.adapter = async (config) => { throw new AxiosError("Network Error", "ERR_NETWORK", config); };
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText("user-a")).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(tokenA);
    api.defaults.adapter = healthy;
    if (mode === "manual") fireEvent.click(screen.getByText("Tentar novamente"));
    else act(() => { window.dispatchEvent(new Event("online")); });
    await screen.findByText("patients-user-a");
  });

  it("expires a session when a sleeping tab resumes", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    changeSession(`header.${btoa(JSON.stringify({ exp }))}.signature`);
    mount(); await screen.findByText("user-b");
    vi.useFakeTimers();
    // Focus also checks expiration after a sleeping/background tab resumes.
    vi.setSystemTime(new Date((exp + 1) * 1000));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(screen.getByText("Login B")).toBeTruthy();
    expect(getSession().token).toBeNull();
  });

  it("expires an idle session by timer without any navigation or request", async () => {
    vi.useFakeTimers();
    const exp = Math.floor(Date.now() / 1000) + 60;
    changeSession(`header.${btoa(JSON.stringify({ exp }))}.signature`);
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText("user-b")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByText("Login B")).toBeTruthy();
    expect(getSession().token).toBeNull();
  });

  it("rejects a disabled identity on /me without treating ordinary permission errors as logout", async () => {
    changeSession(tokenA);
    api.defaults.adapter = async (config) => { throw httpError(config, 403); };
    mount();
    await screen.findByText("Login B");
    expect(getSession().token).toBeNull();
  });

  it("a delayed identity response cannot restore a logged-out user", async () => {
    changeSession(tokenA);
    const pending = deferred<ReturnType<typeof response>>();
    let captured!: InternalAxiosRequestConfig;
    api.defaults.adapter = (config) => { captured = config; return pending.promise; };
    mount();
    await act(async () => {
      changeSession(null);
      pending.resolve(response(captured, { id: "user-a", role: "dentist" }));
    });
    await waitFor(() => expect(screen.getByText("Login B")).toBeTruthy());
    expect(screen.queryByText("user-a")).toBeNull();
  });
});
