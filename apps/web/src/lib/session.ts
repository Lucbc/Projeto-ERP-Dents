export const TOKEN_STORAGE_KEY = "erp_dents_token";

export interface SessionSnapshot {
  token: string | null;
  revision: number;
  signal: AbortSignal;
}

let controller = new AbortController();
let snapshot: SessionSnapshot = {
  token: localStorage.getItem(TOKEN_STORAGE_KEY), revision: 0, signal: controller.signal,
};
const listeners = new Set<() => void>();
export const getSession = () => snapshot;
export const subscribeSession = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

function adopt(token: string | null) {
  if (token === snapshot.token) return;
  const previous = controller;
  controller = new AbortController();
  snapshot = { token, revision: snapshot.revision + 1, signal: controller.signal };
  previous.abort();
  listeners.forEach((listener) => listener());
}

export function syncSession() { adopt(localStorage.getItem(TOKEN_STORAGE_KEY)); }

export function changeSession(token: string | null) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
  adopt(token);
}

export function isCurrentSession(session: SessionSnapshot) {
  // Another tab can update storage before its event reaches this tab.
  syncSession();
  return session === snapshot;
}

export function endSession(session: SessionSnapshot) {
  if (isCurrentSession(session)) changeSession(null);
}

export function sessionExpiresAt(token: string): number | null {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(encoded));
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null; // Only the server validates authenticity; this is a UI timer.
  }
}

export function watchSession() {
  const storage = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === TOKEN_STORAGE_KEY || event.key === null)) syncSession();
  };
  const resume = () => {
    syncSession();
    const current = getSession();
    const expires = current.token ? sessionExpiresAt(current.token) : null;
    if (expires !== null && expires <= Date.now()) endSession(current);
  };
  window.addEventListener("storage", storage);
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  document.addEventListener("visibilitychange", resume);
  resume();
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}
