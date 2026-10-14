import { expect, it } from "vitest";
import { formatDate } from "../src/lib/datetime";

it.each([
  ["2000-01-15", "15/01/2000"],
  ["2000-02-29", "29/02/2000"],
  ["2024-02-29", "29/02/2024"],
  ["1900-02-28", "28/02/1900"],
  ["2030-04-30", "30/04/2030"],
  ["2030-12-31", "31/12/2030"],
  ["0001-01-01", "01/01/0001"],
])("preserves civil date %s", (value, expected) => {
  expect(formatDate(value)).toBe(expected);
});

it.each([null, undefined, "", "invalid", "1900-02-29", "2030-02-29", "2030-04-31",
  "2030-00-10", "2030-13-10", "2030-01-00", "0000-01-01", "2030-1-01",
  "2030-01-01T00:00:00Z", " 2030-01-01", "2030-01-01\n"])("does not invent a civil date for %s", value => {
  expect(formatDate(value)).toBe("-");
});
