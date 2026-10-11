import { useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { ReadSuspensionContext } from "@/hooks/read-suspension";
import { dentistService } from "@/lib/services";
import type { Dentist } from "@/types";

type Snapshot = { action: number | null; status: "idle" | "loading" | "ready" | "error" | "denied"; items: Dentist[] };
const empty: Snapshot = { action: null, status: "idle", items: [] };

/** References belong to one explicit action, never to the live list cache. */
export function useDentistOptions(action: number | null, allowed: boolean) {
  const suspended = useContext(ReadSuspensionContext);
  const [state, setState] = useState<Snapshot>(empty);
  const current = useRef(state);
  const pending = useRef<AbortController>();
  const publish = useCallback((value: Snapshot) => { current.current = value; setState(value); }, []);
  const cancel = useCallback(() => { pending.current?.abort(); pending.current = undefined; }, []);
  const reload = useCallback(async () => {
    if (action === null || !allowed || suspended || pending.current) return false;
    cancel();
    const controller = new AbortController(); pending.current = controller;
    publish({ action, status: "loading", items: [] });
    try {
      const result = await dentistService.listAll({}, controller.signal);
      if (controller.signal.aborted || pending.current !== controller) return false;
      publish({ action, status: "ready", items: result.items });
      return true;
    } catch (error) {
      if (controller.signal.aborted || pending.current !== controller) return false;
      const denied = axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
      publish({ action, status: denied ? "denied" : "error", items: [] });
      return false;
    } finally { if (pending.current === controller) pending.current = undefined; }
  }, [action, allowed, suspended, cancel, publish]);
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
