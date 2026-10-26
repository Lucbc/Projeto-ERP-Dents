import { CLINIC_TIME_ZONE } from "./clinic-zone";

// Never interpret a wall-clock form value with new Date(input): that uses the host zone.
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TIME_ZONE, calendar: "gregory", numberingSystem: "latn",
  era: "short", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };
export type ClinicTimeResult =
  | { ok: true; iso: string }
  | { ok: false; reason: "invalid" | "invalid-original" | "nonexistent" }
  | { ok: false; reason: "ambiguous"; candidates: string[] };

export function clinicTimeError(result: Exclude<ClinicTimeResult, { ok: true }>): string {
  if (result.reason === "nonexistent") return "Este horário não existe em São Paulo devido à mudança do horário de verão. Escolha outro horário.";
  if (result.reason === "ambiguous") return "Este horário ocorreu duas vezes em São Paulo devido ao horário de verão. Mantenha o horário original ou escolha um horário fora da repetição.";
  if (result.reason === "invalid-original") return "O horário original é inválido. Recarregue o registro antes de editar.";
  return "Informe uma data e hora válidas no horário de São Paulo.";
}

export function suggestedClinicEnd(input: string, minutes: number, original?: string): string | null {
  if (!input || !Number.isFinite(minutes) || minutes <= 0) return null;
  const start = resolveClinicInput(input, original);
  if (!start.ok) return null;
  const end = new Date(Date.parse(start.iso) + minutes * 60_000);
  if (!Number.isFinite(end.getTime())) return null;
  try { return toClinicInput(end.toISOString()); } catch { return null; }
}

export function clinicIntervalIsPositive(start: string, end: string): boolean {
  const micros = (iso: string) => BigInt(Date.parse(iso)) * 1000n +
    BigInt((iso.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
  return micros(end) > micros(start);
}

function utcValue(wall: WallTime): number {
  const date = new Date(0);
  // Date.UTC interprets years 0..99 as 1900..1999.
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day);
  date.setUTCHours(wall.hour, wall.minute, wall.second, 0);
  return date.getTime();
}

function validWall(wall: WallTime): boolean {
  const date = new Date(utcValue(wall));
  return wall.year >= 1 && wall.year <= 9999 && date.getUTCFullYear() === wall.year &&
    date.getUTCMonth() + 1 === wall.month && date.getUTCDate() === wall.day &&
    date.getUTCHours() === wall.hour && date.getUTCMinutes() === wall.minute &&
    date.getUTCSeconds() === wall.second;
}

function partsAt(instant: number): WallTime {
  const parts = formatter.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  const year = Number(value("year"));
  return {
    year: value("era") === "BC" ? 1 - year : year,
    month: Number(value("month")), day: Number(value("day")),
    hour: Number(value("hour")), minute: Number(value("minute")), second: Number(value("second")),
  };
}

function wallFromMatch(match: RegExpMatchArray): WallTime {
  return { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5], second: +(match[6] ?? 0) };
}

function instantValue(iso: string): number {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match || !validWall(wallFromMatch(match))) return NaN;
  return Date.parse(iso);
}

/** Minute-resolution form text in the clinic zone. Invalid/naive instants are rejected. */
export function toClinicInput(iso: string): string {
  const instant = instantValue(iso);
  if (!Number.isFinite(instant)) throw new RangeError("Invalid offset-bearing instant");
  const wall = partsAt(instant);
  if (wall.year < 1 || wall.year > 9999) throw new RangeError("Clinic date outside supported form range");
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** Resolve a clinical wall time without silently shifting gaps or choosing a repeated hour. */
export function resolveClinicInput(input: string, original?: string): ClinicTimeResult {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return { ok: false, reason: "invalid" };
  const wall = wallFromMatch(match);
  if (!validWall(wall)) return { ok: false, reason: "invalid" };
  if (original !== undefined) {
    try {
      if (input === toClinicInput(original)) return { ok: true, iso: original };
    } catch {
      return { ok: false, reason: "invalid-original" };
    }
  }
  const nominal = utcValue(wall);
  const offsets = new Set<number>();
  // São Paulo's historical changes are separated by more than this window.
  // Sample both sides; derive second-resolution offsets from IANA/Intl (including LMT).
  // This is scoped to São Paulo, not a generic resolver for arbitrary timezone rules.
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = nominal + hours * 3_600_000;
    offsets.add(utcValue(partsAt(probe)) - probe);
  }
  const candidates = [...offsets].map(offset => nominal - offset)
    .filter(instant => utcValue(partsAt(instant)) === nominal)
    .sort((a, b) => a - b).map(instant => new Date(instant).toISOString());
  if (!candidates.length) return { ok: false, reason: "nonexistent" };
  // The API/form contract uses four-digit years, including the resulting UTC instant.
  if (candidates.some(iso => !Number.isFinite(instantValue(iso)))) return { ok: false, reason: "invalid" };
  if (candidates.length > 1) return { ok: false, reason: "ambiguous", candidates };
  return { ok: true, iso: candidates[0] };
}
