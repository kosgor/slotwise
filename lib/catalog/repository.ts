// Cached catalog reads for Server Components. Pages import only from here.
// "use cache" stores the result; arguments become part of the cache key.
// cacheTag("catalog") lets stage 2 invalidate everything with revalidateTag("catalog")
// when a provider edits their profile.

import { cacheLife, cacheTag } from "next/cache";

import { searchCatalog, type CatalogPage, type CatalogQuery } from "./query";
import { loadApprovedSummaries, loadProviderDetails } from "./source";
import type { ProviderDetails, ProviderSummary } from "./types";

export async function searchProviders(query: CatalogQuery): Promise<CatalogPage> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return searchCatalog(await loadApprovedSummaries(), query);
}

export async function getFeaturedProviders(limit = 3): Promise<ProviderSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const page = searchCatalog(await loadApprovedSummaries(), { sort: "rating", page: 1 });
  return page.items.slice(0, limit);
}

export async function getProviderBySlug(slug: string): Promise<ProviderDetails | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog", `provider:${slug}`);
  return loadProviderDetails(slug);
}

export async function getAllProviderSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return (await loadApprovedSummaries()).map(({ slug, updatedAt }) => ({ slug, updatedAt }));
}

export async function getCatalogStats(): Promise<{ cities: string[]; providerCount: number }> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const all = await loadApprovedSummaries();
  return { cities: [...new Set(all.map((p) => p.city))].sort(), providerCount: all.length };
}
