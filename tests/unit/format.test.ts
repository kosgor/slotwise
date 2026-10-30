import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatPrice,
  formatsLabel,
  pluralize,
  startingPrice,
} from "@/lib/catalog/format";

describe("formatPrice", () => {
  it("formats integer pence without decimals", () => {
    expect(formatPrice(4500)).toBe("£45");
    expect(formatPrice(0)).toBe("£0");
    expect(formatPrice(19000)).toBe("£190");
  });
});

describe("formatDuration", () => {
  it.each([
    [20, "20 min"],
    [60, "1 h"],
    [90, "1 h 30 min"],
    [120, "2 h"],
  ])("%i minutes -> %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("startingPrice", () => {
  it("shows a free intro instead of £0", () => {
    expect(startingPrice({ minPriceCents: 0, currency: "GBP" })).toBe("Free intro");
    expect(startingPrice({ minPriceCents: 2500, currency: "GBP" })).toBe("From £25");
  });
});

describe("formatsLabel", () => {
  it("describes session formats", () => {
    expect(formatsLabel({ offersOnline: true, offersInPerson: true })).toBe("Online and in person");
    expect(formatsLabel({ offersOnline: true, offersInPerson: false })).toBe("Online");
    expect(formatsLabel({ offersOnline: false, offersInPerson: true })).toBe("In person");
  });
});

describe("pluralize", () => {
  it("picks singular for exactly one", () => {
    expect(pluralize(1, "review", "reviews")).toBe("1 review");
    expect(pluralize(0, "review", "reviews")).toBe("0 reviews");
  });
});
