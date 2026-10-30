import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { ReadSuspensionContext } from "@/hooks/read-suspension";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";

type Snapshot = { action: number | null; selected: string; status: "loading" | "ready" | "error" | "denied"; items: Patient[]; total: number };
export const PATIENT_PAGE_SIZE = 20;

/** Small action snapshot plus the selected record, even outside the first page. */
export function usePatientReferences(action: number | null, selected: string, allowed: boolean) {
  const suspended = useContext(ReadSuspensionContext);
  const [state, setState] = useState<Snapshot>({ action: null, selected: "", status: "loading", items: [], total: 0 });
  const pending = useRef<AbortController>();
  const current = useRef(state);
  current.current = state;
  const mounted = useRef(false);
  const scope = useRef({ action, selected, allowed, suspended });
  scope.current = { action, selected, allowed, suspended };
  const cancel = useCallback(() => { pending.current?.abort(); pending.current = undefined; }, []);
  const deny = useCallback(() => {
    cancel(); setState({ action, selected, status: "denied", items: [], total: 0 });
  }, [action, selected, cancel]);
  const remember = useCallback((patient: Patient) => {
    if (!scope.current.allowed || scope.current.suspended || current.current.action !== action || current.current.status !== "ready") return;
    const items = current.current.items.slice(0, PATIENT_PAGE_SIZE).filter(item => item.id !== patient.id);
    setState({ ...current.current, selected: patient.id, items: [...items, patient] });
  }, [action]);
  const reload = useCallback(async () => {
    if (!mounted.current || action === null || !allowed || suspended || scope.current.action !== action
      || scope.current.selected !== selected || !scope.current.allowed || scope.current.suspended) return false;
    cancel();
    const controller = new AbortController(); pending.current = controller;
    setState({ action, selected, status: "loading", items: [], total: 0 });
    try {
      const page = await patientService.list({ limit: PATIENT_PAGE_SIZE, offset: 0 }, controller.signal);
      const items = [...page.items];
      if (selected && !items.some(item => item.id === selected)) {
        try { items.push(await patientService.get(selected, controller.signal)); }
        catch (error) { if (!isAxiosError(error) || error.response?.status !== 404) throw error; }
      }
      if (controller.signal.aborted || pending.current !== controller) return false;
      setState({ action, selected, status: "ready", items, total: page.total });
      return true;
    } catch (error) {
      if (controller.signal.aborted || pending.current !== controller) return false;
      const denied = isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
      setState({ action, selected, status: denied ? "denied" : "error", items: [], total: 0 });
      return false;
    } finally { if (pending.current === controller) pending.current = undefined; }
  }, [action, selected, allowed, suspended, cancel]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel(); }; }, [cancel]);
  useEffect(() => {
    if (!allowed) deny();
    else if (action === null) { cancel(); setState({ action, selected, status: "loading", items: [], total: 0 }); }
    else if (!suspended) {
      const cached = current.current;
      if (cached.action === action && cached.status === "ready" && (!selected || cached.items.some(item => item.id === selected))) {
        if (cached.selected !== selected) setState({ ...cached, selected });
      } else if (!(cached.action === action && cached.selected === selected && cached.status === "ready")) void reload();
    }
    return cancel;
  }, [action, selected, allowed, suspended, deny, reload, cancel]);
  const same = action !== null && state.action === action && state.selected === selected;
  return {
    action, items: same && allowed ? state.items : [], total: same && allowed ? state.total : 0,
    status: !allowed ? "denied" : same ? state.status : "loading",
    ready: same && state.status === "ready" && allowed && !suspended,
    reload, cancel, deny, remember,
  };
}
