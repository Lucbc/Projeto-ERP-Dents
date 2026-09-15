import axios, { type InternalAxiosRequestConfig } from "axios";
import { endSession, getSession, isCurrentSession, type SessionSnapshot } from "./session";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
  timeout: 15000,
});

const requests = new WeakMap<InternalAxiosRequestConfig, {
  session: SessionSnapshot; authenticated: boolean; cleanup: () => void;
}>();
const publicPaths = new Set(["/api/auth/login", "/api/auth/bootstrap-admin", "/api/auth/needs-bootstrap"]);

api.interceptors.request.use((config) => {
  const session = getSession();
  if (!isCurrentSession(session)) throw new axios.CanceledError("Sessão alterada.");
  const authenticated = Boolean(session.token) && !publicPaths.has(config.url ?? "");
  if (authenticated) config.headers.Authorization = `Bearer ${session.token}`;
  else config.headers.delete("Authorization");
  const controller = new AbortController();
  const original = config.signal;
  const abort = () => controller.abort();
  session.signal.addEventListener("abort", abort, { once: true });
  original?.addEventListener?.("abort", abort);
  if (session.signal.aborted || original?.aborted) abort();
  config.signal = controller.signal;
  requests.set(config, { session, authenticated, cleanup: () => {
    session.signal.removeEventListener("abort", abort);
    original?.removeEventListener?.("abort", abort);
  } });
  return config;
}, (error) => { throw error; }, { synchronous: true });

function finish(config?: InternalAxiosRequestConfig) {
  const request = config && requests.get(config);
  request?.cleanup();
  if (request && !isCurrentSession(request.session)) {
    throw new axios.CanceledError("Resposta de sessão anterior descartada.");
  }
  return request;
}

api.interceptors.response.use((response) => {
  finish(response.config);
  return response;
}, (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const request = finish(error.config);
    // /me has no resource permission gate: its 403 means the account is inactive.
    const rejectedIdentity = error.response?.status === 401
      || (error.response?.status === 403 && error.config?.url === "/api/auth/me");
    if (rejectedIdentity && request?.authenticated) endSession(request.session);
  }
  return Promise.reject(error);
});

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response && !axios.isCancel(error)) {
      return "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.";
    }
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (typeof error.message === "string" && error.message) return error.message;
  }
  return "Erro inesperado.";
}
