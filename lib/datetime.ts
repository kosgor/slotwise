// Date and time formatting with an explicit time zone. Never rely on the server's or the browser's
// default zone: the server runs in UTC, users and providers live elsewhere.

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, ...options });
    cache.set(key, f);
  }
  return f;
}

/** "10:30" */
export const formatTime = (date: Date, timeZone: string) =>
  formatter(timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);

/** "Tuesday, 3 November" */
export const formatDayLong = (date: Date, timeZone: string) =>
  formatter(timeZone, { weekday: "long", day: "numeric", month: "long" }).format(date);

/** "Tue, 3 Nov" */
export const formatDayShort = (date: Date, timeZone: string) =>
  formatter(timeZone, { weekday: "short", day: "numeric", month: "short" }).format(date);

/** "Tue, 3 Nov 2026, 10:30" */
export const formatDateTime = (date: Date, timeZone: string) =>
  formatter(timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

/** A "YYYY-MM-DD" calendar date as a Date at noon UTC — only for formatting the day name. */
export const dateKeyToDate = (key: string) => new Date(`${key}T12:00:00Z`);

/** Readable zone name: "Europe/Warsaw" -> "Warsaw time". */
export const zoneLabel = (timeZone: string) =>
  `${timeZone.split("/").at(-1)!.replace(/_/g, " ")} time`;
