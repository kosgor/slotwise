// Free-slot calculation: a pure function, no database, no React.
//
// Schedules are stored in the provider's local time ("Mon 09:00–13:00 in Europe/Warsaw"), bookings
// in absolute time (UTC). Every candidate slot is converted between the two with @date-fns/tz, so
// daylight-saving changes are handled: a slot whose local time does not exist (spring forward)
// is skipped, and a slot's end is computed in absolute time — exactly like book_slot() in SQL.

import { TZDate } from "@date-fns/tz";

import { MAX_ADVANCE_DAYS, MIN_NOTICE_MINUTES, SLOT_STEP_MINUTES } from "./rules";
import type { AvailabilityException, AvailabilityRule, BusyInterval } from "./types";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export type SlotInput = {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busy: BusyInterval[];
  durationMin: number;
  /** Provider's IANA time zone, e.g. "Europe/Warsaw". */
  timeZone: string;
  /** Only slots starting in [from, to) are returned. */
  from: Date;
  to: Date;
  now: Date;
};

/** "09:30" -> 570 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDateKey = (d: TZDate) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutesOfDay = (d: TZDate) => d.getHours() * 60 + d.getMinutes();

/** ISO weekday (1 = Monday … 7 = Sunday) of a local calendar date. Noon avoids DST edge hours. */
function isoWeekday(timeZone: string, y: number, m: number, d: number): number {
  const day = TZDate.tz(timeZone, y, m, d, 12).getDay();
  return day === 0 ? 7 : day;
}

export function getAvailableSlots(input: SlotInput): Date[] {
  const { rules, exceptions, busy, durationMin, timeZone, from, to, now } = input;
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * MINUTE;
  const latest = now.getTime() + MAX_ADVANCE_DAYS * DAY;
  const slots: number[] = [];

  // Walk the provider-local calendar dates that overlap [from, to).
  const first = new TZDate(from.getTime(), timeZone);
  let cursor = TZDate.tz(timeZone, first.getFullYear(), first.getMonth(), first.getDate(), 12);
  while (
    TZDate.tz(timeZone, cursor.getFullYear(), cursor.getMonth(), cursor.getDate()).getTime() <
    to.getTime()
  ) {
    const [y, m, d] = [cursor.getFullYear(), cursor.getMonth(), cursor.getDate()];
    const dateKey = localDateKey(cursor);
    const weekday = isoWeekday(timeZone, y, m, d);
    const dayExceptions = exceptions.filter((e) => e.date === dateKey);
    const dayOff = dayExceptions.some((e) => e.startTime === null);

    if (!dayOff) {
      for (const rule of rules.filter((r) => r.weekday === weekday)) {
        const ruleStart = toMinutes(rule.startTime);
        const ruleEnd = toMinutes(rule.endTime);

        for (let t = ruleStart; t < ruleEnd; t += SLOT_STEP_MINUTES) {
          const start = TZDate.tz(timeZone, y, m, d, Math.floor(t / 60), t % 60);
          // Local time that does not exist (DST spring forward): the library moved it. Skip.
          if (localDateKey(start) !== dateKey || minutesOfDay(start) !== t) continue;

          const startMs = start.getTime();
          const endMs = startMs + durationMin * MINUTE;
          const end = new TZDate(endMs, timeZone);
          // Must end inside the same working-hours rule, on the same local date.
          if (localDateKey(end) !== dateKey || minutesOfDay(end) > ruleEnd) continue;
          const endLocal = minutesOfDay(end);

          if (startMs < from.getTime() || startMs >= to.getTime()) continue;
          if (startMs < earliest || startMs > latest) continue;

          const blocked = dayExceptions.some(
            (e) => t < toMinutes(e.endTime!) && endLocal > toMinutes(e.startTime!),
          );
          if (blocked) continue;

          const taken = busy.some(
            (b) => startMs < b.endsAt.getTime() && endMs > b.startsAt.getTime(),
          );
          if (taken) continue;

          slots.push(startMs);
        }
      }
    }

    cursor = TZDate.tz(timeZone, y, m, d + 1, 12);
  }

  // No dedupe: rules on one weekday cannot overlap (exclusion constraint in the database), so a
  // duplicate here would mean a bug — e.g. a non-existent DST time shifted onto an existing slot.
  return slots.sort((a, b) => a - b).map((ms) => new Date(ms));
}

/** [start, end) of a calendar date ("YYYY-MM-DD") in the given time zone, as absolute instants. */
export function localDayRange(date: string, timeZone: string): { from: Date; to: Date } {
  const [y, m, d] = date.split("-").map(Number);
  const from = TZDate.tz(timeZone, y!, m! - 1, d!);
  const to = TZDate.tz(timeZone, y!, m! - 1, d! + 1);
  return { from: new Date(from.getTime()), to: new Date(to.getTime()) };
}

/** Today's date ("YYYY-MM-DD") in the given time zone. */
export function localToday(timeZone: string, now: Date): string {
  return localDateKey(new TZDate(now.getTime(), timeZone));
}

/** Next `count` calendar dates starting today, in the given time zone. */
export function nextLocalDates(timeZone: string, now: Date, count: number): string[] {
  const today = new TZDate(now.getTime(), timeZone);
  return Array.from({ length: count }, (_, i) =>
    localDateKey(
      TZDate.tz(timeZone, today.getFullYear(), today.getMonth(), today.getDate() + i, 12),
    ),
  );
}
