import { CLINIC_TIME_ZONE } from "./clinic-zone";
import { clinicTimeError, resolveClinicInput, toClinicInput } from "./clinic-time";
export { CLINIC_TIME_ZONE } from "./clinic-zone";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { timeZone: CLINIC_TIME_ZONE });
}

export function formatDate(value: string | null | undefined): string {
  // Civil dates carry no time or timezone. Reject impossible dates rather than
  // allowing Date to normalize them into a different day/month.
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.length !== 10) return "-";
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return "-";
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

export function toInputDateTime(isoValue: string): string {
  return toClinicInput(isoValue);
}

export function fromInputDateTime(input: string, original?: string): string {
  const result = resolveClinicInput(input, original);
  if (!result.ok) throw new RangeError(clinicTimeError(result));
  return result.iso;
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", { timeZone: CLINIC_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

const clinicDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TIME_ZONE, calendar: "gregory", numberingSystem: "latn",
  year: "numeric", month: "2-digit", day: "2-digit",
});

/** The clinic's civil day at this instant, independent of the workstation zone. */
export function clinicDate(now: Date = new Date()): string {
  const parts = clinicDateFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  return `${value("year").padStart(4, "0")}-${value("month")}-${value("day")}`;
}
