import { expect, it } from "vitest";
import { formatPhone } from "../src/lib/phone";

it.each([
  ["", ""], ["1", "(1"], ["11", "(11"], ["1133", "(11) 33"],
  ["1133334444", "(11) 3333-4444"], ["11987654321", "(11) 98765-4321"],
  ["(11) 9-8765-4321", "(11) 98765-4321"],
  ["+55 (11) 98765-4321", "+55 (11) 98765-4321"],
  ["5511987654321", "5511987654321"],
  ["(11) 3333-4444 ramal 20", "(11) 3333-4444 ramal 20"],
])("formats without discarding information: %s", (input, expected) => {
  expect(formatPhone(input)).toBe(expected);
  expect(formatPhone(expected)).toBe(expected);
});
