// Only a non-authenticating marker is shared across tabs. JWT stays HttpOnly.
export const SESSION_STORAGE_KEY = "erp_dents_session_marker";
localStorage.removeItem("erp_dents_token");
export interface SessionSnapshot {
  sessionId: string | null; // UI marker, never an authentication credential
  csrfToken: string | null;
  expiresAt: number | null;
  ready: boolean;
  revision: number;
  signal: AbortSignal;
}
let controller = new AbortController();
let snapshot: SessionSnapshot = {
  sessionId: localStorage.getItem(SESSION_STORAGE_KEY), csrfToken: null, expiresAt: null,
  ready: false, revision: 0, signal: controller.signal,
};
const listeners = new Set<() => void>();
export const getSession = () => snapshot;
export const subscribeSession = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function adopt(sessionId: string | null, csrfToken: string | null, expiresAt: number | null, ready: boolean) {
  if (sessionId === snapshot.sessionId && csrfToken === snapshot.csrfToken
      && ready === snapshot.ready && expiresAt === snapshot.expiresAt) return;
  const previous = controller;
  controller = new AbortController();
  snapshot = { sessionId, csrfToken, expiresAt, ready, revision: snapshot.revision + 1, signal: controller.signal };
  previous.abort();
  listeners.forEach((listener) => listener());
}
export function syncSession() {
  const marker = localStorage.getItem(SESSION_STORAGE_KEY);
  if (marker !== snapshot.sessionId) adopt(marker, null, null, false);
}
export function changeSession(sessionId: string | null, csrfToken: string | null = null, expiresAt: number | null = null) {
  if (sessionId) localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  else localStorage.removeItem(SESSION_STORAGE_KEY);
  adopt(sessionId, csrfToken, expiresAt, true);
}
export function isCurrentSession(session: SessionSnapshot) {
  syncSession();
  return session === snapshot;
}
export function endSession(session: SessionSnapshot) {
  if (isCurrentSession(session)) changeSession(null);
}
export function watchSession() {
  const storage = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === SESSION_STORAGE_KEY || event.key === null)) syncSession();
  };
  const resume = () => {
    syncSession();
    const current = getSession();
    if (current.expiresAt !== null && current.expiresAt <= Date.now()) endSession(current);
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
