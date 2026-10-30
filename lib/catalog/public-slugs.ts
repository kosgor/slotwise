// Fast "does this public profile exist?" check for proxy.ts, so unknown profiles get a real
// HTTP 404 before the page starts streaming (ADR 0004).
//
// The slug list is kept in memory: proxy runs on every profile request, and we do not want a
// database round trip per page view. Two time limits:
// * a known slug is trusted for up to SLUG_TTL_MS (a suspended provider disappears within it;
//   the profile page itself is already gone, the catalog cache is expired on suspension);
// * an unknown slug triggers a reload if the list is older than MISS_RECHECK_MS, so a provider
//   approved a moment ago is reachable at once, while junk URLs cost at most one query per window.

import { loadApprovedSummaries } from "./source";

const SLUG_TTL_MS = 60_000;
const MISS_RECHECK_MS = 5_000;
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let cache: { slugs: Set<string>; loadedAt: number } | null = null;

export async function isPublicProviderSlug(
  slug: string,
  now = Date.now(),
  load: () => Promise<{ slug: string }[]> = loadApprovedSummaries,
): Promise<boolean> {
  // Reject junk without touching data: same rule as the slug check constraint in SQL.
  if (!SLUG_FORMAT.test(slug) || slug.length > 80) return false;
  const age = cache ? now - cache.loadedAt : Infinity;
  const stale = age > SLUG_TTL_MS;
  const missWorthChecking = cache !== null && !cache.slugs.has(slug) && age > MISS_RECHECK_MS;
  if (stale || missWorthChecking) {
    const summaries = await load();
    cache = { slugs: new Set(summaries.map((p) => p.slug)), loadedAt: now };
  }
  return cache!.slugs.has(slug);
}

/** For tests only. */
export function resetPublicSlugCache() {
  cache = null;
}
