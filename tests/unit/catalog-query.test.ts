import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  catalogHref,
  filterProviders,
  hasActiveFilters,
  paginate,
  parseCatalogQuery,
  searchCatalog,
  sortProviders,
  summarizeProviders,
} from "@/lib/catalog/query";
import { providers, reviews, services } from "@/lib/catalog/seed-data";

const all = summarizeProviders(providers, services, reviews);
const q = (params: Record<string, string>) => parseCatalogQuery(params);

describe("parseCatalogQuery", () => {
  it("returns defaults for an empty URL", () => {
    expect(q({})).toEqual({
      q: undefined,
      category: undefined,
      city: undefined,
      format: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      sort: "recommended",
      page: 1,
    });
  });

  it("parses valid values", () => {
    expect(
      q({
        q: " yoga ",
        category: "yoga",
        format: "online",
        minPrice: "20",
        maxPrice: "80",
        sort: "price_asc",
        page: "2",
      }),
    ).toMatchObject({
      q: "yoga",
      category: "yoga",
      format: "online",
      minPrice: 20,
      maxPrice: 80,
      sort: "price_asc",
      page: 2,
    });
  });

  it("ignores invalid values instead of throwing", () => {
    expect(
      q({
        category: "astrology",
        format: "teleport",
        minPrice: "-5",
        maxPrice: "abc",
        sort: "random",
        page: "0",
      }),
    ).toMatchObject({
      category: undefined,
      format: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      sort: "recommended",
      page: 1,
    });
  });

  it("treats empty form fields as absent", () => {
    expect(q({ q: "", category: "", minPrice: "" })).toMatchObject({
      q: undefined,
      category: undefined,
      minPrice: undefined,
    });
  });

  it("uses the first value of a repeated key", () => {
    expect(parseCatalogQuery({ city: ["Manchester", "London"] }).city).toBe("Manchester");
  });

  it("swaps a reversed price range", () => {
    expect(q({ minPrice: "100", maxPrice: "20" })).toMatchObject({ minPrice: 20, maxPrice: 100 });
  });

  it("rejects an overly long search string", () => {
    expect(q({ q: "x".repeat(500) }).q).toBeUndefined();
  });
});

describe("catalogHref", () => {
  it("omits defaults", () => {
    expect(catalogHref({ sort: "recommended", page: 1 })).toBe("/pros");
  });

  it("round-trips through parseCatalogQuery", () => {
    const query = q({
      q: "guitar lessons",
      category: "music",
      city: "Leeds",
      minPrice: "0",
      sort: "rating",
      page: "3",
    });
    const href = catalogHref(query);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseCatalogQuery(params)).toEqual(query);
  });
});

describe("summarizeProviders", () => {
  it("lists only approved providers", () => {
    expect(all.every((p) => p.status === "approved")).toBe(true);
    expect(all.find((p) => p.slug === "zoe-coaching")).toBeUndefined();
    expect(all.find((p) => p.slug === "gary-fitness")).toBeUndefined();
  });

  it("computes min price and excludes hidden reviews from the rating", () => {
    const provider = providers[0]!;
    const summary = summarizeProviders(
      [provider],
      [
        {
          id: "s1",
          providerId: provider.id,
          title: "A",
          description: "",
          durationMin: 60,
          priceCents: 5000,
          currency: "GBP",
          active: true,
        },
        {
          id: "s2",
          providerId: provider.id,
          title: "B",
          description: "",
          durationMin: 30,
          priceCents: 2000,
          currency: "GBP",
          active: true,
        },
        {
          id: "s3",
          providerId: provider.id,
          title: "C",
          description: "",
          durationMin: 30,
          priceCents: 100,
          currency: "GBP",
          active: false,
        },
      ],
      [
        {
          id: "r1",
          providerId: provider.id,
          authorName: "",
          rating: 5,
          body: "",
          createdAt: "",
          hidden: false,
        },
        {
          id: "r2",
          providerId: provider.id,
          authorName: "",
          rating: 4,
          body: "",
          createdAt: "",
          hidden: false,
        },
        {
          id: "r3",
          providerId: provider.id,
          authorName: "",
          rating: 1,
          body: "",
          createdAt: "",
          hidden: true,
        },
      ],
    )[0]!;
    expect(summary.minPriceCents).toBe(2000);
    expect(summary.ratingAvg).toBe(4.5);
    expect(summary.reviewCount).toBe(2);
  });

  it("skips providers without active services", () => {
    expect(summarizeProviders([providers[0]!], [], [])).toEqual([]);
  });

  it("has unique slugs", () => {
    expect(new Set(providers.map((p) => p.slug)).size).toBe(providers.length);
  });
});

describe("filterProviders", () => {
  it("filters by category", () => {
    const result = filterProviders(all, q({ category: "massage" }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.category === "massage")).toBe(true);
  });

  it("filters by city case-insensitively", () => {
    const result = filterProviders(all, q({ city: "manchester" }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.city === "Manchester")).toBe(true);
  });

  it("filters by format", () => {
    expect(filterProviders(all, q({ format: "online" })).every((p) => p.offersOnline)).toBe(true);
    expect(filterProviders(all, q({ format: "in_person" })).every((p) => p.offersInPerson)).toBe(
      true,
    );
  });

  it("filters by price range using the cheapest service", () => {
    const result = filterProviders(all, q({ minPrice: "20", maxPrice: "30" }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.minPriceCents >= 2000 && p.minPriceCents <= 3000)).toBe(true);
  });

  it("matches every search word across name, headline, bio and city", () => {
    expect(filterProviders(all, q({ q: "guitar liverpool" })).map((p) => p.slug)).toEqual([
      "jamie-music",
    ]);
    expect(filterProviders(all, q({ q: "guitar oxford" }))).toEqual([]);
  });

  it("combines filters with AND", () => {
    const result = filterProviders(all, q({ category: "yoga", format: "online" }));
    expect(result.every((p) => p.category === "yoga" && p.offersOnline)).toBe(true);
  });
});

describe("sortProviders", () => {
  it("sorts by price both ways", () => {
    const asc = sortProviders(all, "price_asc").map((p) => p.minPriceCents);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = sortProviders(all, "price_desc").map((p) => p.minPriceCents);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("sorts by rating, highest first", () => {
    const ratings = sortProviders(all, "rating").map((p) => p.ratingAvg ?? 0);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it("does not mutate the input", () => {
    const before = all.map((p) => p.id);
    sortProviders(all, "price_desc");
    expect(all.map((p) => p.id)).toEqual(before);
  });
});

describe("paginate", () => {
  it("splits into pages", () => {
    const page = paginate(all, 1);
    expect(page.items).toHaveLength(PAGE_SIZE);
    expect(page.total).toBe(all.length);
    expect(page.pageCount).toBe(Math.ceil(all.length / PAGE_SIZE));
  });

  it("clamps a page past the end to the last page", () => {
    const page = paginate(all, 999);
    expect(page.page).toBe(page.pageCount);
    expect(page.items.length).toBeGreaterThan(0);
  });

  it("returns one empty page for no results", () => {
    expect(paginate([], 3)).toEqual({ items: [], total: 0, page: 1, pageCount: 1 });
  });
});

describe("searchCatalog", () => {
  it("filters, sorts and paginates together", () => {
    const result = searchCatalog(all, q({ format: "online", sort: "price_asc" }));
    expect(result.items.every((p) => p.offersOnline)).toBe(true);
    expect(result.items[0]!.minPriceCents).toBeLessThanOrEqual(result.items.at(-1)!.minPriceCents);
  });
});

describe("hasActiveFilters", () => {
  it("ignores sort and page", () => {
    expect(hasActiveFilters(q({ sort: "rating", page: "2" }))).toBe(false);
    expect(hasActiveFilters(q({ minPrice: "0" }))).toBe(true);
  });
});
