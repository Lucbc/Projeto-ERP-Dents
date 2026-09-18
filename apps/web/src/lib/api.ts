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
    const status = error.response?.status;
    const reference = error.response?.data?.request_id;
    const suffix = typeof reference === "string" && /^[a-f0-9]{32}$/.test(reference) ? ` Referência: ${reference}.` : "";
    if (status && status >= 500) {
      return (status === 503
        ? "O serviço está temporariamente indisponível. Confira o resultado da operação antes de tentar novamente."
        : status === 507 ? "Não foi possível usar o armazenamento do servidor. Avise o responsável pelo sistema."
        : "Não foi possível concluir a operação. Confira os dados antes de tentar novamente.") + suffix;
    }
    const detail = error.response?.data?.detail;
    if (status === 422 && Array.isArray(detail)) {
      const labels: Record<string, string> = {
        email: "E-mail", password: "Senha", current_password: "Senha atual", new_password: "Nova senha",
        name: "Nome", full_name: "Nome completo", birth_date: "Data de nascimento", cpf: "CPF",
        patient_id: "Paciente", dentist_id: "Dentista", procedure_ids: "Procedimentos", start_at: "Início",
        end_at: "Término", amount_cents: "Valor", price_cents: "Preço", duration_minutes: "Duração",
        due_date: "Vencimento", status: "Status", role: "Perfil", file: "Arquivo",
      };
      const messages = detail.slice(0, 5).map((item: unknown) => {
        const issue = item && typeof item === "object" ? item as { loc?: unknown; type?: unknown } : {};
        const field = Array.isArray(issue.loc) ? issue.loc.find((part) => typeof part === "string" && labels[part]) : undefined;
        return `${field ? labels[field] : "Dados enviados"}: ${issue.type === "missing" ? "campo obrigatório" : "valor inválido"}.`;
      });
      return [...new Set(messages)].join(" ") || "Revise os campos informados.";
    }
    if (typeof detail === "string") return detail;
    if (status === 403) return "Você não tem permissão para executar esta ação.";
    if (status === 404) return "O registro não está mais disponível. Atualize a tela.";
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}
