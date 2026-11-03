// Cached catalog reads for Server Components. Pages import only from here.
// "use cache" stores the result; arguments become part of the cache key.
// cacheTag("catalog") lets stage 2 invalidate everything with revalidateTag("catalog")
// when a provider edits their profile.

import { cacheLife, cacheTag } from "next/cache";

import { searchCatalog, type CatalogPage, type CatalogQuery } from "./query";
import { REVIEWS_PAGE_SIZE, type ReviewsPage } from "./reviews";
import { loadApprovedSummaries, loadProviderDetails, loadReviewsPage } from "./source";
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

/** More reviews of a public profile ("Show more reviews"); null for an unknown or hidden slug. */
export async function getProviderReviews(
  slug: string,
  offset: number,
): Promise<ReviewsPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog", `provider:${slug}`);
  const provider = await getProviderBySlug(slug);
  if (!provider) return null;
  return loadReviewsPage(provider.id, offset, REVIEWS_PAGE_SIZE);
}

/** Slug of every public profile by provider id, for links from bookings to the profile. */
export async function getPublicSlugsById(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return Object.fromEntries((await loadApprovedSummaries()).map((p) => [p.id, p.slug]));
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
