import { describe, expect, it } from "vitest";

import { canonicalCatalogUrl } from "@/lib/catalog/canonical";

const canon = (qs: string) => canonicalCatalogUrl(new URLSearchParams(qs));

describe("canonicalCatalogUrl", () => {
  it("returns null for URLs that are already canonical", () => {
    expect(canon("")).toBeNull();
    expect(canon("category=yoga&format=online")).toBeNull();
  });

  it("drops empty fields and defaults submitted by a plain GET form", () => {
    expect(canon("q=&category=yoga&city=&format=online&minPrice=&maxPrice=&sort=recommended")).toBe(
      "/pros?category=yoga&format=online",
    );
  });

  it("drops invalid values and page 1", () => {
    expect(canon("category=astrology&page=1")).toBe("/pros");
  });

  it("normalizes parameter order", () => {
    expect(canon("format=online&category=yoga")).toBe("/pros?category=yoga&format=online");
  });

  it("keeps unrelated params such as utm tags", () => {
    expect(canon("utm_source=newsletter&city=")).toBe("/pros?utm_source=newsletter");
    expect(canon("category=yoga&utm_source=newsletter")).toBeNull();
  });
});
