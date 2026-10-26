import { useSyncExternalStore } from "react";
import { clinicDate } from "@/lib/datetime";
import { clinicDayRange } from "@/lib/clinic-calendar";


function subscribe(notify: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    notify();
    const next = Date.parse(clinicDayRange(clinicDate()).to) + 1;
    timer = setTimeout(schedule, Math.max(1, next - Date.now()));
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

/** Clinical day, including DST boundaries and return from suspended tabs. */
export function useClinicDay() {
  const day = useSyncExternalStore(subscribe, clinicDate);
  return clinicDayRange(day);
}
