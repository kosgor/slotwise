import { describe, expect, it } from "vitest";

import { parseReviewsOffset, ratingBreakdown } from "@/lib/catalog/reviews";

describe("ratingBreakdown", () => {
  it("counts reviews per rating, 5 stars first", () => {
    expect(ratingBreakdown([5, 5, 4, 3, 5, 1])).toEqual([3, 1, 1, 0, 1]);
    expect(ratingBreakdown([])).toEqual([0, 0, 0, 0, 0]);
  });

  it("ignores values outside 1–5", () => {
    expect(ratingBreakdown([0, 6, 5, 2.5])).toEqual([1, 0, 0, 0, 0]);
  });
});

describe("parseReviewsOffset", () => {
  it("accepts whole numbers in range", () => {
    expect(parseReviewsOffset("0")).toBe(0);
    expect(parseReviewsOffset("15")).toBe(15);
    expect(parseReviewsOffset("10000")).toBe(10_000);
  });

  it("rejects anything else", () => {
    for (const raw of [null, "", "-5", "1.5", "5abc", "1e3", "10001", " 5", "99999"]) {
      expect(parseReviewsOffset(raw), String(raw)).toBeNull();
    }
  });
});
