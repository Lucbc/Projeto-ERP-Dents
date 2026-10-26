import { expect, it } from "vitest";
import type { SlotInfo } from "react-big-calendar";
import { clinicCalendarLocalizer, clinicDayRange, clinicSelection } from "../src/lib/clinic-calendar";
import { clinicIntervalIsPositive, suggestedClinicEnd } from "../src/lib/clinic-time";
import { formatDateTime, formatTime, fromInputDateTime } from "../src/lib/datetime";

it.each([
  ["2020-01-07", "2020-01-07T03:00:00.000Z", "2020-01-08T02:59:59.999999Z", 24],
  ["2018-11-04", "2018-11-04T03:00:00.000Z", "2018-11-05T01:59:59.999999Z", 23],
  ["2019-02-16", "2019-02-16T02:00:00.000Z", "2019-02-17T02:59:59.999999Z", 25],
])("filters the entire clinical day %s including its last microsecond", (day, from, to, hours) => {
  expect(clinicDayRange(day)).toEqual({ from, to });
  expect((Date.parse(to) + 1 - Date.parse(from)) / 3_600_000).toBe(hours);
});

it.each(["2026-02-30", "2026-13-01", "invalid"])("rejects invalid filter %s", day => {
  expect(() => clinicDayRange(day)).toThrow(RangeError);
});

it("uses elapsed duration through DST and rejects invalid starts or overflow", () => {
  expect(suggestedClinicEnd("2018-11-03T23:30", 60)).toBe("2018-11-04T01:30");
  expect(suggestedClinicEnd("2018-11-04T00:30", 60)).toBeNull();
  expect(suggestedClinicEnd("2019-02-16T23:30", 60)).toBeNull();
  expect(suggestedClinicEnd("2019-02-16T23:30", 120, "2019-02-17T01:30:00Z")).toBe("2019-02-17T00:30");
  expect(suggestedClinicEnd("9999-12-31T20:00", 300)).toBeNull();
});

it("preserves interval ordering below a millisecond", () => {
  expect(clinicIntervalIsPositive("2020-01-07T13:00:00.123456Z", "2020-01-07T10:00:00.123457-03:00")).toBe(true);
  expect(clinicIntervalIsPositive("2020-01-07T13:00:00.123456Z", "2020-01-07T10:00:00.123455-03:00")).toBe(false);
});

it("formats and converts shared instants independently of the computer", () => {
  expect(formatTime("2020-01-08T01:30:00Z")).toBe("22:30");
  expect(formatDateTime("2020-01-08T01:30:00Z")).toContain("07/01/2020");
  expect(fromInputDateTime("2020-01-07T22:30")).toBe("2020-01-08T01:30:00.000Z");
  expect(() => fromInputDateTime("2018-11-04T00:30")).toThrow(/não existe/);
});

it("normalizes all-day selection using clinical dates across a workstation DST change", () => {
  const start = new Date("2020-03-07T03:00:00Z");
  const last = new Date("2020-03-08T03:00:00Z");
  const slot = { start, end: new Date("2020-03-09T02:00:00Z"), slots: [start, last], action: "select" } as SlotInfo;
  expect(clinicSelection(slot, "month")).toEqual({ start, end: new Date("2020-03-09T03:00:00Z") });
  expect(clinicSelection(slot, "week")).toEqual({ start, end: new Date("2020-03-09T03:00:00Z") });
  expect(clinicCalendarLocalizer.segmentOffset).toBe(0);
});
