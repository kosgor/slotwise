// Calendar helpers on "YYYY-MM-DD" date keys in a given time zone. Pure functions, tested.

import { TZDate } from "@date-fns/tz";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: TZDate) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (key: string) => key.split("-").map(Number) as [number, number, number];

/** Local calendar date of an instant in a time zone. */
export function dateKeyIn(instant: Date, timeZone: string): string {
  return keyOf(new TZDate(instant.getTime(), timeZone));
}

/** Date key shifted by n days (calendar arithmetic, unaffected by DST). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = parse(key);
  return keyOf(TZDate.tz("UTC", y, m - 1, d + n, 12));
}

/** Monday of the ISO week that contains the date. */
export function mondayOf(key: string): string {
  const [y, m, d] = parse(key);
  const day = TZDate.tz("UTC", y, m - 1, d, 12).getDay(); // 0 = Sunday
  return addDays(key, -((day + 6) % 7));
}

/** Seven date keys starting at the given Monday. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
