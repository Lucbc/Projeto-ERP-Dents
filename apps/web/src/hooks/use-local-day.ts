import { useSyncExternalStore } from "react";

function dayStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function subscribe(notify: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    notify();
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    timer = setTimeout(schedule, Math.max(1, next.getTime() - Date.now()));
  };
  schedule();
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("focus", schedule);
  window.addEventListener("online", schedule);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", schedule);
    window.removeEventListener("focus", schedule);
    window.removeEventListener("online", schedule);
  };
}

/** Local browser day, including DST boundaries and return from suspended tabs. */
export function useLocalDay() {
  const from = useSyncExternalStore(subscribe, dayStart);
  const end = new Date(from);
  end.setHours(23, 59, 59, 999);
  return { from, to: end.toISOString() };
}
