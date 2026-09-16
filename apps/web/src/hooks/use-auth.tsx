import {
  createContext, type PropsWithChildren, useCallback, useContext, useEffect,
  useMemo, useRef, useState, useSyncExternalStore,
} from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import { api } from "@/lib/api";
import { createQueryClient } from "@/lib/query-client";
import {
  changeSession, endSession, getSession, isCurrentSession, sessionExpiresAt,
  subscribeSession, watchSession, type SessionSnapshot,
} from "@/lib/session";
import type { TokenResponse, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const session = useSyncExternalStore(subscribeSession, getSession);
  useEffect(watchSession, []);
  // Remount page state, forms, toasts and cache on every identity change.
  return <SessionScope key={session.revision} session={session}>{children}</SessionScope>;
}

function SessionScope({ children, session }: PropsWithChildren<{ session: SessionSnapshot }>) {
  const [queryClient] = useState(createQueryClient);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(session.token));
  const [sessionError, setSessionError] = useState(false);
  const [logoutState, setLogoutState] = useState<"idle" | "pending" | "failed">("idle");
  const loggingOut = useRef(false);
  const validation = useRef(0);
  useEffect(() => () => { queryClient.clear(); }, [queryClient]);
  const logout = useCallback(() => {
    if (!isCurrentSession(session) || loggingOut.current) return;
    if (!session.token) { endSession(session); return; }
    loggingOut.current = true;
    setLogoutState("pending");
    void api.post("/api/auth/logout").then(() => endSession(session)).catch(() => {
      if (isCurrentSession(session)) setLogoutState("failed");
    }).finally(() => { loggingOut.current = false; });
  }, [session]);

  const refreshMe = useCallback(async () => {
    if (!session.token || !isCurrentSession(session)) return;
    const attempt = ++validation.current;
    setIsLoading(true);
    setSessionError(false);
    try {
      const response = await api.get<User>("/api/auth/me");
      if (isCurrentSession(session) && attempt === validation.current) setUser(response.data);
    } catch (error) {
      if (isCurrentSession(session) && attempt === validation.current && !axios.isCancel(error)) {
        // Connection/5xx failures preserve credentials but hide unvalidated data.
        setSessionError(true);
      }
    } finally {
      if (isCurrentSession(session) && attempt === validation.current) setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refreshMe();
    return () => { validation.current++; };
  }, [refreshMe]);

  useEffect(() => {
    if (!session.token) return;
    const expires = sessionExpiresAt(session.token);
    if (expires === null) return;
    let timer: number;
    const check = () => {
      const remaining = expires - Date.now();
      if (remaining <= 0) endSession(session);
      else timer = window.setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    check();
    return () => window.clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (!sessionError) return;
    const retry = () => { void refreshMe(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [sessionError, refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<TokenResponse>("/api/auth/login", { email, password });
    if (isCurrentSession(session)) changeSession(response.data.access_token);
  }, [session]);
  const value = useMemo(() => ({ user, token: session.token, isLoading, login, logout }),
    [user, session.token, isLoading, login, logout]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={value}>
        {logoutState !== "idle" ? (
          <div role="alert" className="mx-auto mt-16 max-w-lg space-y-4 rounded-lg border p-6">
            {logoutState === "pending" ? <p>Encerrando sessão no servidor...</p> : <>
              <p>Não foi possível confirmar a saída no servidor. Verifique a conexão e tente novamente.</p>
              <button onClick={logout} className="rounded bg-cyan-600 px-4 py-2 text-white">Tentar sair novamente</button>
            </>}
          </div>
        ) : isLoading ? <div role="status" className="p-8">Carregando sessão...</div> : sessionError ? (
          <div role="alert" className="mx-auto mt-16 max-w-lg space-y-4 rounded-lg border p-6">
            <h1 className="text-lg font-semibold">Não foi possível validar sua sessão</h1>
            <p>Verifique a conexão com o servidor e tente novamente. Seu acesso salvo foi preservado.</p>
            <div className="flex gap-4">
              <button className="rounded bg-cyan-600 px-4 py-2 text-white" onClick={() => void refreshMe()}>Tentar novamente</button>
              <button className="rounded border px-4 py-2" onClick={logout}>Sair</button>
            </div>
          </div>
        ) : children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
