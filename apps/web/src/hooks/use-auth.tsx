import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, TOKEN_STORAGE_KEY } from "@/lib/api";
import type { TokenResponse, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setSession: (token: string, user: User) => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setSession = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
      clearSession();
      return;
    }

    const response = await api.get<User>("/api/auth/me");
    setUser(response.data);
  }, [clearSession]);

  useEffect(() => {
    const init = async () => {
      try {
        if (token) {
          await refreshMe();
        }
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    void init();
  }, [token, refreshMe, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<TokenResponse>("/api/auth/login", { email, password });
    setSession(response.data.access_token, response.data.user);
  }, [setSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, token, isLoading, login, logout, setSession, refreshMe }),
    [user, token, isLoading, login, logout, setSession, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
