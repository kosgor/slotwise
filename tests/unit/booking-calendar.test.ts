import { describe, expect, it } from "vitest";

import { addDays, dateKeyIn, mondayOf, weekDays } from "@/lib/booking/calendar";

describe("calendar helpers", () => {
  it("gives the local date of an instant", () => {
    // 23:30 UTC on 1 Nov is already 2 Nov in Warsaw, still 1 Nov in New York.
    const instant = new Date("2026-11-01T23:30:00Z");
    expect(dateKeyIn(instant, "Europe/Warsaw")).toBe("2026-11-02");
    expect(dateKeyIn(instant, "America/New_York")).toBe("2026-11-01");
  });

  it("adds days across month ends and DST changes", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // Europe DST ends on 25 Oct
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-11-04")).toBe("2026-11-02"); // Wednesday
    expect(mondayOf("2026-11-02")).toBe("2026-11-02"); // Monday itself
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // Sunday belongs to the same ISO week
  });

  it("lists seven days of a week", () => {
    expect(weekDays("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
});
