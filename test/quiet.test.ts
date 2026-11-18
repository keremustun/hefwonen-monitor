import { expect, test } from "vitest";
import { isQuiet } from "../src/quiet.ts";

const R = "23:00-07:30";
// Winter (CET = UTC+1) and summer (CEST = UTC+2).
const winter = (hhmm: string) => new Date(`2026-01-15T${hhmm}:00+01:00`);
const summer = (hhmm: string) => new Date(`2026-07-15T${hhmm}:00+02:00`);

test.each([
  ["22:59", false],
  ["23:00", true],
  ["02:00", true],
  ["07:29", true],
  ["07:30", false],
  ["12:00", false],
])("nachtrust om %s Nederlandse tijd = %s (winter en zomer)", (t, expected) => {
  expect(isQuiet(winter(t), R)).toBe(expected);
  expect(isQuiet(summer(t), R)).toBe(expected);
});

test("lege of ongeldige instelling = nooit nachtrust", () => {
  expect(isQuiet(winter("02:00"), "")).toBe(false);
  expect(isQuiet(winter("02:00"), "onzin")).toBe(false);
});
