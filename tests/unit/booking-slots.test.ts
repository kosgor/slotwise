import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";

import {
  canClientCancel,
  canClientReschedule,
  clientCancellationDeadline,
} from "@/lib/booking/rules";
import { getAvailableSlots, localDayRange, nextLocalDates } from "@/lib/booking/slots";
import type { AvailabilityRule } from "@/lib/booking/types";

const WARSAW = "Europe/Warsaw";
const rule = (weekday: number, startTime: string, endTime: string): AvailabilityRule => ({
  id: `${weekday}-${startTime}`,
  providerId: "p",
  weekday,
  startTime,
  endTime,
});

/** Local "HH:MM" of each slot in the given zone — easier to read in assertions than ISO strings. */
const local = (slots: Date[], tz: string) =>
  slots.map((s) => {
    const d = new TZDate(s.getTime(), tz);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

// Monday, 2 November 2026 in Warsaw (CET, UTC+1).
const MONDAY = "2026-11-02";
const FAR_BEFORE = new Date("2026-10-01T00:00:00Z");

function slotsFor(overrides: Partial<Parameters<typeof getAvailableSlots>[0]> = {}) {
  return getAvailableSlots({
    rules: [rule(1, "09:00", "13:00"), rule(1, "14:00", "18:00")],
    exceptions: [],
    busy: [],
    durationMin: 60,
    timeZone: WARSAW,
    ...localDayRange(MONDAY, WARSAW),
    now: FAR_BEFORE,
    ...overrides,
  });
}

describe("getAvailableSlots", () => {
  it("lists 30-minute steps that fit inside each working-hours block", () => {
    expect(local(slotsFor(), WARSAW)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
  });

  it("lets a long service end exactly at the end of the block, not after", () => {
    expect(
      local(slotsFor({ rules: [rule(1, "09:00", "13:00")], durationMin: 90 }), WARSAW),
    ).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  });

  it("returns nothing on a weekday without rules", () => {
    expect(slotsFor(localDayRange("2026-11-01", WARSAW))).toEqual([]); // Sunday
  });

  it("maps Sunday to ISO weekday 7", () => {
    const sunday = slotsFor({
      rules: [rule(7, "10:00", "11:00")],
      ...localDayRange("2026-11-01", WARSAW),
    });
    expect(local(sunday, WARSAW)).toEqual(["10:00"]);
  });

  it("removes slots that overlap a booking but keeps back-to-back ones", () => {
    const busy = [
      {
        startsAt: TZDate.tz(WARSAW, 2026, 10, 2, 10, 0),
        endsAt: TZDate.tz(WARSAW, 2026, 10, 2, 11, 0),
      },
    ];
    const slots = local(slotsFor({ rules: [rule(1, "09:00", "13:00")], busy }), WARSAW);
    expect(slots).toEqual(["09:00", "11:00", "11:30", "12:00"]);
  });

  it("skips a whole day off", () => {
    const exceptions = [
      { id: "e", providerId: "p", date: MONDAY, startTime: null, endTime: null, reason: "" },
    ];
    expect(slotsFor({ exceptions })).toEqual([]);
  });

  it("skips only the blocked part of a partial exception", () => {
    const exceptions = [
      { id: "e", providerId: "p", date: MONDAY, startTime: "09:00", endTime: "11:00", reason: "" },
    ];
    expect(local(slotsFor({ rules: [rule(1, "09:00", "13:00")], exceptions }), WARSAW)).toEqual([
      "11:00",
      "11:30",
      "12:00",
    ]);
  });

  it("requires at least one hour of notice", () => {
    const now = TZDate.tz(WARSAW, 2026, 10, 2, 9, 10); // 09:10 → earliest start 10:10
    expect(local(slotsFor({ rules: [rule(1, "09:00", "13:00")], now }), WARSAW)[0]).toBe("10:30");
  });

  it("does not offer slots more than 60 days ahead", () => {
    const now = new Date("2026-09-02T12:00:00Z"); // 61 days before the Monday
    expect(slotsFor({ now })).toEqual([]);
  });

  it("converts the provider's local hours to absolute time", () => {
    // New York in November is UTC-5: 09:00 there is 14:00 UTC and 15:00 in Warsaw.
    const slots = getAvailableSlots({
      rules: [rule(1, "09:00", "10:00")],
      exceptions: [],
      busy: [],
      durationMin: 60,
      timeZone: "America/New_York",
      ...localDayRange(MONDAY, "America/New_York"),
      now: FAR_BEFORE,
    });
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-11-02T14:00:00.000Z"]);
    expect(local(slots, WARSAW)).toEqual(["15:00"]);
  });

  describe("daylight saving time (Europe/Berlin)", () => {
    const BERLIN = "Europe/Berlin";

    it("skips local times that do not exist when clocks go forward", () => {
      // Sunday 28 March 2027: 02:00 jumps to 03:00.
      const slots = getAvailableSlots({
        rules: [rule(7, "01:00", "05:00")],
        exceptions: [],
        busy: [],
        durationMin: 60,
        timeZone: BERLIN,
        ...localDayRange("2027-03-28", BERLIN),
        now: new Date("2027-03-01T00:00:00Z"),
      });
      // 01:30 + 60 real minutes ends at 03:30 local — still inside the block.
      expect(local(slots, BERLIN)).toEqual(["01:00", "01:30", "03:00", "03:30", "04:00"]);
    });

    it("produces unique, valid slots when clocks go back", () => {
      // Sunday 25 October 2026: 02:00–02:59 happens twice.
      const slots = getAvailableSlots({
        rules: [rule(7, "01:00", "04:00")],
        exceptions: [],
        busy: [],
        durationMin: 60,
        timeZone: BERLIN,
        ...localDayRange("2026-10-25", BERLIN),
        now: new Date("2026-10-01T00:00:00Z"),
      });
      const iso = slots.map((s) => s.toISOString());
      expect(new Set(iso).size).toBe(iso.length);
      for (const s of slots) {
        const end = new TZDate(s.getTime() + 60 * 60 * 1000, BERLIN);
        expect(end.getHours() * 60 + end.getMinutes()).toBeLessThanOrEqual(4 * 60);
      }
      expect(local(slots, BERLIN)[0]).toBe("01:00");
    });
  });
});

describe("localDayRange / nextLocalDates", () => {
  it("returns the absolute bounds of a local day", () => {
    const { from, to } = localDayRange(MONDAY, WARSAW);
    expect(from.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-02T23:00:00.000Z");
  });

  it("lists upcoming local dates starting today", () => {
    // 23:30 UTC on 1 Nov is already 2 Nov in Warsaw.
    expect(nextLocalDates(WARSAW, new Date("2026-11-01T23:30:00Z"), 3)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
  });
});

describe("client cancellation rule", () => {
  const start = new Date("2026-11-10T10:00:00Z");

  it("allows cancellation until exactly 24 hours before", () => {
    expect(clientCancellationDeadline(start).toISOString()).toBe("2026-11-09T10:00:00.000Z");
    expect(canClientCancel(start, new Date("2026-11-09T10:00:00Z"))).toBe(true);
    expect(canClientCancel(start, new Date("2026-11-09T10:00:01Z"))).toBe(false);
  });
});

describe("client reschedule rule", () => {
  const start = new Date("2026-11-10T10:00:00Z");

  it("allows moving a booking until exactly 24 hours before, like cancelling", () => {
    expect(canClientReschedule(start, new Date("2026-11-09T10:00:00Z"))).toBe(true);
    expect(canClientReschedule(start, new Date("2026-11-09T10:00:01Z"))).toBe(false);
  });
});
