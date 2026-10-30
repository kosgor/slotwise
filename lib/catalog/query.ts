// Catalog search: URL params <-> CatalogQuery, plus pure filter/sort/paginate.
// The URL is the single source of truth for filters, so any state can be shared or bookmarked.

import { z } from "zod";

import { FORMATS, PAGE_SIZE, SORT_OPTIONS, type SortOption } from "./constants";
import {
  CATEGORIES,
  type Provider,
  type ProviderSummary,
  type Review,
  type Service,
} from "./types";

// Re-exported so server code can keep importing everything catalog-related from one place.
export * from "./constants";

const MAX_QUERY_LENGTH = 100;

// Every field falls back to "not set" instead of failing: a hand-edited URL never breaks the page.
const optionalTrimmed = z
  .string()
  .trim()
  .max(MAX_QUERY_LENGTH)
  .transform((v) => v || undefined)
  .optional()
  .catch(undefined);

const optionalDollars = z.coerce.number().int().min(0).max(100_000).optional().catch(undefined);

const catalogQuerySchema = z.object({
  q: optionalTrimmed,
  category: z.enum(CATEGORIES).optional().catch(undefined),
  city: optionalTrimmed,
  format: z.enum(FORMATS).optional().catch(undefined),
  minPrice: optionalDollars,
  maxPrice: optionalDollars,
  sort: z.enum(SORT_OPTIONS).catch("recommended"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Parses Next.js `searchParams`. Repeated keys (`?city=a&city=b`) use the first value. */
export function parseCatalogQuery(params: RawSearchParams): CatalogQuery {
  const first = (key: string) => {
    const value = params[key];
    const v = Array.isArray(value) ? value[0] : value;
    // Empty form fields arrive as "" — treat them as absent so defaults apply.
    return v === "" ? undefined : v;
  };
  const query = catalogQuerySchema.parse({
    q: first("q"),
    category: first("category"),
    city: first("city"),
    format: first("format"),
    minPrice: first("minPrice"),
    maxPrice: first("maxPrice"),
    sort: first("sort"),
    page: first("page"),
  });
  // A reversed range is almost certainly a typo: swap instead of returning nothing.
  if (
    query.minPrice !== undefined &&
    query.maxPrice !== undefined &&
    query.minPrice > query.maxPrice
  ) {
    [query.minPrice, query.maxPrice] = [query.maxPrice, query.minPrice];
  }
  return query;
}

/** Builds a canonical `/pros?...` URL. Defaults are omitted so URLs stay short and cacheable. */
export function catalogHref(query: Partial<CatalogQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.city) params.set("city", query.city);
  if (query.format) params.set("format", query.format);
  if (query.minPrice !== undefined) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined) params.set("maxPrice", String(query.maxPrice));
  if (query.sort && query.sort !== "recommended") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `/pros?${qs}` : "/pros";
}

export function hasActiveFilters(query: CatalogQuery): boolean {
  return Boolean(
    query.q ||
    query.category ||
    query.city ||
    query.format ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined,
  );
}

/** Joins providers with their active services and visible reviews. Only approved providers. */
export function summarizeProviders(
  providers: Provider[],
  services: Service[],
  reviews: Review[],
): ProviderSummary[] {
  return providers
    .filter((p) => p.status === "approved")
    .flatMap((p) => {
      const own = services.filter((s) => s.providerId === p.id && s.active);
      // A provider without bookable services has nothing to show in the catalog.
      if (own.length === 0) return [];
      const visible = reviews.filter((r) => r.providerId === p.id && !r.hidden);
      const ratingAvg =
        visible.length > 0
          ? Math.round((visible.reduce((sum, r) => sum + r.rating, 0) / visible.length) * 10) / 10
          : null;
      return [
        {
          ...p,
          minPriceCents: Math.min(...own.map((s) => s.priceCents)),
          currency: own[0]!.currency,
          ratingAvg,
          reviewCount: visible.length,
        },
      ];
    });
}

function matchesText(provider: ProviderSummary, q: string): boolean {
  const haystack = [provider.displayName, provider.headline, provider.bio, provider.city]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export function filterProviders(items: ProviderSummary[], query: CatalogQuery): ProviderSummary[] {
  return items.filter((p) => {
    if (query.category && p.category !== query.category) return false;
    if (query.city && p.city.toLowerCase() !== query.city.toLowerCase()) return false;
    if (query.format === "online" && !p.offersOnline) return false;
    if (query.format === "in_person" && !p.offersInPerson) return false;
    // Price filters compare against the cheapest service, in whole dollars from the URL.
    if (query.minPrice !== undefined && p.minPriceCents < query.minPrice * 100) return false;
    if (query.maxPrice !== undefined && p.minPriceCents > query.maxPrice * 100) return false;
    if (query.q && !matchesText(p, query.q)) return false;
    return true;
  });
}

export function sortProviders(items: ProviderSummary[], sort: SortOption): ProviderSummary[] {
  const byName = (a: ProviderSummary, b: ProviderSummary) =>
    a.displayName.localeCompare(b.displayName);
  const rating = (p: ProviderSummary) => p.ratingAvg ?? 0;
  const sorted = [...items];
  switch (sort) {
    case "price_asc":
      return sorted.sort((a, b) => a.minPriceCents - b.minPriceCents || byName(a, b));
    case "price_desc":
      return sorted.sort((a, b) => b.minPriceCents - a.minPriceCents || byName(a, b));
    case "rating":
      return sorted.sort(
        (a, b) => rating(b) - rating(a) || b.reviewCount - a.reviewCount || byName(a, b),
      );
    case "recommended":
      // Social proof first: weighted by number of reviews, ties broken by name for stable output.
      return sorted.sort(
        (a, b) => rating(b) * b.reviewCount - rating(a) * a.reviewCount || byName(a, b),
      );
  }
}

export type CatalogPage = {
  items: ProviderSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export function paginate(
  items: ProviderSummary[],
  page: number,
  pageSize = PAGE_SIZE,
): CatalogPage {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Out-of-range pages clamp to the last page instead of showing an empty list.
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    total: items.length,
    page: current,
    pageCount,
  };
}

export function searchCatalog(items: ProviderSummary[], query: CatalogQuery): CatalogPage {
  return paginate(sortProviders(filterProviders(items, query), query.sort), query.page);
}
