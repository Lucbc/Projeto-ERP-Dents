import { DateTime } from "luxon";
import { luxonLocalizer, type SlotInfo } from "react-big-calendar";
import { CLINIC_TIME_ZONE } from "./clinic-zone";

export const clinicalDate = (date: Date) => DateTime.fromJSDate(date, { zone: CLINIC_TIME_ZONE }).setLocale("pt-BR");

// A scoped facade: no Settings.defaultZone mutation and no synthetic shifted Dates.
export const clinicCalendarLocalizer = luxonLocalizer({
  fromJSDate: clinicalDate,
  local: () => clinicalDate(new Date()),
  min: DateTime.min,
  max: DateTime.max,
}, { firstDayOfWeek: 1 });
// All arithmetic already uses clinical days; RBC's host-offset correction would shorten multi-day events.
clinicCalendarLocalizer.segmentOffset = 0;

export function clinicDayRange(day: string): { from: string; to: string } {
  const start = DateTime.fromISO(day, { zone: CLINIC_TIME_ZONE }).startOf("day");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !start.isValid || start.toISODate() !== day) throw new RangeError("Data clínica inválida");
  const end = start.plus({ days: 1 }).startOf("day").minus({ milliseconds: 1 }).toUTC().toISO();
  if (!end || !/^\d{4}-/.test(end)) throw new RangeError("Data clínica fora do intervalo permitido");
  // API uses an inclusive upper bound and PostgreSQL stores microseconds.
  return { from: start.toUTC().toISO()!, to: end.replace(/\.\d{3}Z$/, ".999999Z") };
}

export function clinicMonthWindow(now: Date, months: number) {
  const date = clinicalDate(now);
  return {
    from: clinicDayRange(date.minus({ months }).toISODate()!).from,
    to: clinicDayRange(date.plus({ months }).toISODate()!).to,
  };
}

export function clinicSelection(slot: SlotInfo, view: string): { start: Date; end: Date } {
  const days = slot.slots.filter((date): date is Date => date instanceof Date);
  const allMidnights = days.length > 0 && days.every(date => clinicalDate(date).startOf("day").toMillis() === date.getTime());
  // Month/all-day selection in RBC uses host getDate/setDate outside the localizer.
  if (view === "month" || (allMidnights && slot.end.getTime() - slot.start.getTime() >= 20 * 3_600_000)) {
    const start = clinicalDate(days[0] ?? slot.start).startOf("day");
    const end = clinicalDate(days[days.length - 1] ?? slot.start).plus({ days: 1 }).startOf("day");
    return { start: start.toJSDate(), end: end.toJSDate() };
  }
  return { start: slot.start, end: slot.end };
}
