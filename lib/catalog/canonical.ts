import { catalogHref, parseCatalogQuery, type RawSearchParams } from "./query";

const CATALOG_KEYS = new Set([
  "q",
  "category",
  "city",
  "format",
  "minPrice",
  "maxPrice",
  "sort",
  "page",
]);

/**
 * Returns the canonical `/pros?...` URL for the given search params, or null if they are already
 * canonical. Empty fields, defaults and invalid values are dropped; unrelated params
 * (utm_source, etc.) are kept so campaign tracking survives the redirect.
 */
export function canonicalCatalogUrl(search: URLSearchParams): string | null {
  const raw: RawSearchParams = {};
  const extra = new URLSearchParams();
  for (const [key, value] of search) {
    if (!CATALOG_KEYS.has(key)) {
      extra.append(key, value);
      continue;
    }
    const existing = raw[key];
    raw[key] = existing === undefined ? value : ([] as string[]).concat(existing, value);
  }

  const canonical = catalogHref(parseCatalogQuery(raw));
  const extraQs = extra.toString();
  const target = extraQs
    ? `${canonical}${canonical.includes("?") ? "&" : "?"}${extraQs}`
    : canonical;

  const current = search.toString() ? `/pros?${search.toString()}` : "/pros";
  return target === current ? null : target;
}
