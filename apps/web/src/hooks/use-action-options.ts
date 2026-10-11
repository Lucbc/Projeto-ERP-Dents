import { useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ReadSuspensionContext } from "@/hooks/read-suspension";

type Snapshot<T> = { action: number | null; status: "idle" | "loading" | "ready" | "error" | "denied"; items: T[] };


/** References belong to one explicit action, never to the live list cache. */
export function useActionOptions<T>(action: number | null, allowed: boolean, read: (signal: AbortSignal) => Promise<{ items: T[] }>) {
  const empty: Snapshot<T> = { action: null, status: "idle", items: [] };
  const suspended = useContext(ReadSuspensionContext);
  const [state, setState] = useState<Snapshot<T>>(empty);
  const current = useRef(state);
  const pending = useRef<AbortController>();
  const mounted = useRef(false);
  const scope = useRef({ action, allowed, suspended });
  scope.current = { action, allowed, suspended };
  const publish = useCallback((value: Snapshot<T>) => { current.current = value; setState(value); }, []);
  const cancel = useCallback(() => { pending.current?.abort(); pending.current = undefined; }, []);
  const reload = useCallback(async () => {
    if (!mounted.current || action === null || !allowed || suspended || pending.current
      || scope.current.action !== action || !scope.current.allowed || scope.current.suspended) return false;
    cancel();
    const controller = new AbortController(); pending.current = controller;
    publish({ action, status: "loading", items: [] });
    try {
      const result = await read(controller.signal);
      if (controller.signal.aborted || pending.current !== controller) return false;
      publish({ action, status: "ready", items: result.items });
      return true;
    } catch (error) {
      if (controller.signal.aborted || pending.current !== controller) return false;
      const denied = axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
      publish({ action, status: denied ? "denied" : "error", items: [] });
      return false;
    } finally { if (pending.current === controller) pending.current = undefined; }
  }, [action, allowed, suspended, cancel, publish, read]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancel(); };
  }, [cancel]);
  useEffect(() => {
    if (action === null) publish(empty);
    else if (!allowed) publish({ action, status: "denied", items: [] });
    else if (!suspended && (current.current.action !== action || current.current.status !== "ready")) void reload();
    return cancel;
  }, [action, allowed, suspended, reload, cancel, publish]);
  const same = state.action === action && action !== null;
  return {
    items: same && allowed ? state.items : [],
    status: !allowed ? "denied" : same ? state.status : "loading",
    ready: same && state.status === "ready" && allowed && !suspended,
    reload, cancel,
  };
}
