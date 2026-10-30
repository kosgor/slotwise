import { describe, expect, it } from "vitest";

import { pageWindow } from "@/components/features/catalog/pagination";

describe("pagination window", () => {
  it("shows every page up to seven", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first, last, current and neighbours, with gaps, always seven slots", () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, 4, 5, null, 40]);
    expect(pageWindow(4, 40)).toEqual([1, 2, 3, 4, 5, null, 40]);
    expect(pageWindow(5, 40)).toEqual([1, null, 4, 5, 6, null, 40]);
    expect(pageWindow(20, 40)).toEqual([1, null, 19, 20, 21, null, 40]);
    expect(pageWindow(37, 40)).toEqual([1, null, 36, 37, 38, 39, 40]);
    expect(pageWindow(40, 40)).toEqual([1, null, 36, 37, 38, 39, 40]);
    expect(pageWindow(5, 8)).toEqual([1, null, 4, 5, 6, 7, 8]);
  });
});

describe("compact pagination window (phones)", () => {
  it("keeps five slots: ends, current, gaps", () => {
    expect(pageWindow(3, 5, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 40, 5)).toEqual([1, 2, 3, null, 40]);
    expect(pageWindow(2, 40, 5)).toEqual([1, 2, 3, null, 40]);
    expect(pageWindow(3, 40, 5)).toEqual([1, null, 3, null, 40]);
    expect(pageWindow(38, 40, 5)).toEqual([1, null, 38, null, 40]);
    expect(pageWindow(39, 40, 5)).toEqual([1, null, 38, 39, 40]);
    expect(pageWindow(40, 6, 5)).toEqual([1, null, 4, 5, 6]);
  });
});
