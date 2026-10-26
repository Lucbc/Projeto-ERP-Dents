import { expect, it } from "vitest";
import { resolveClinicInput, toClinicInput } from "../src/lib/clinic-time";

it.each([
  ["2030-01-08T01:30:00Z", "2030-01-07T22:30"],
  ["2030-01-07T22:30:00-03:00", "2030-01-07T22:30"],
  ["2030-01-08T10:30:00+09:00", "2030-01-07T22:30"],
  ["2018-01-15T12:30:00Z", "2018-01-15T10:30"],
  ["2018-11-04T02:59:59Z", "2018-11-03T23:59"],
  ["2018-11-04T03:00:00Z", "2018-11-04T01:00"],
  ["2019-02-17T01:30:00Z", "2019-02-16T23:30"],
  ["2019-02-17T02:30:00Z", "2019-02-16T23:30"],
  ["1900-01-01T13:06:28Z", "1900-01-01T10:00"],
  ["0099-01-01T13:06:28Z", "0099-01-01T10:00"],
])("formats %s using the clinical timezone", (iso, input) => {
  expect(toClinicInput(iso)).toBe(input);
});

it.each([
  ["2030-01-07T22:30", "2030-01-08T01:30:00.000Z"],
  ["2032-02-29T23:30", "2032-03-01T02:30:00.000Z"],
  ["2030-12-31T23:30", "2031-01-01T02:30:00.000Z"],
  ["2018-01-15T10:30", "2018-01-15T12:30:00.000Z"],
  ["2018-11-04T01:00", "2018-11-04T03:00:00.000Z"],
  ["2019-02-17T00:00", "2019-02-17T03:00:00.000Z"],
  ["1900-01-01T10:00", "1900-01-01T13:06:28.000Z"],
  ["0099-01-01T10:00", "0099-01-01T13:06:28.000Z"],
  ["0001-01-01T00:00", "0001-01-01T03:06:28.000Z"],
  ["9999-12-31T20:59", "9999-12-31T23:59:00.000Z"],
])("resolves %s without a host-zone conversion", (input, iso) => {
  expect(resolveClinicInput(input)).toEqual({ ok: true, iso });
  expect(toClinicInput(iso)).toBe(input);
});

it.each(["", "2030-02-29T10:00", "2030-04-31T10:00", "2030-00-01T10:00",
  "2030-13-01T10:00", "2030-01-00T10:00", "2030-01-01T24:00", "2030-01-01T10:60",
  "0000-01-01T00:00", "2030-1-1T01:00", "2030-01-01T10:00Z", "2030-01-01T10:00:00",
  "2030-01-01T10:00\n", " 2030-01-01T10:00", "9999-12-31T21:00"])("rejects invalid wall time %j", input => {
  expect(resolveClinicInput(input)).toEqual({ ok: false, reason: "invalid" });
});

it.each(["2018-11-04T00:00", "2018-11-04T00:30", "2018-11-04T00:59", "1914-01-01T00:03"])(
  "does not normalize a nonexistent time %s", input => {
    expect(resolveClinicInput(input)).toEqual({ ok: false, reason: "nonexistent" });
  });

it("reports both instants of a repeated hour instead of choosing one", () => {
  expect(resolveClinicInput("2019-02-16T23:30")).toEqual({
    ok: false, reason: "ambiguous",
    candidates: ["2019-02-17T01:30:00.000Z", "2019-02-17T02:30:00.000Z"],
  });
});

it.each(["2019-02-16T23:30:12.123456-02:00", "2019-02-16T23:30:47.654321-03:00"])(
  "preserves the exact original including the repeated-hour choice: %s", original => {
    expect(resolveClinicInput("2019-02-16T23:30", original)).toEqual({ ok: true, iso: original });
    expect(resolveClinicInput("2019-02-16T23:31", original)).toMatchObject({ ok: false, reason: "ambiguous" });
    expect(resolveClinicInput("2019-02-17T00:15", original)).toEqual({ ok: true, iso: "2019-02-17T03:15:00.000Z" });
  });

it("preserves submillisecond precision and converts only an actual edit", () => {
  const original = "2030-01-08T10:30:12.123456+09:00";
  expect(resolveClinicInput("2030-01-07T22:30", original)).toEqual({ ok: true, iso: original });
  expect(resolveClinicInput("2030-01-07T22:31", original)).toEqual({ ok: true, iso: "2030-01-08T01:31:00.000Z" });
});

it.each(["", "invalid", "2030-01-01T10:00:00", "2030-02-30T10:00:00Z",
  "2030-01-01T24:00:00Z", "2030-01-01T10:00:00+24:00", "2030-01-01T10:00:60Z"])(
  "rejects invalid or naive originals %j", original => {
    expect(() => toClinicInput(original)).toThrow(RangeError);
    expect(resolveClinicInput("2030-01-01T10:00", original)).toEqual({ ok: false, reason: "invalid-original" });
  });
