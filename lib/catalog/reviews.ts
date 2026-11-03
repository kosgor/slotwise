// Reviews on a profile: the newest few are in the page HTML, the rest load on demand
// (GET /api/pros/[slug]/reviews?offset=…), so a profile with hundreds of reviews stays light.
// Pure logic only: no database, no React.

import type { Review } from "./types";

/** Reviews rendered with the profile page, newest first. */
export const REVIEWS_FIRST_PAGE = 5;
/** Reviews added by each "Show more reviews". */
export const REVIEWS_PAGE_SIZE = 10;

/** Upper bound for `offset`: far beyond any real profile, keeps the database query bounded. */
const MAX_OFFSET = 10_000;

/** How many reviews have each rating: index 0 is 5 stars, index 4 is 1 star (display order). */
export function ratingBreakdown(ratings: number[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const r of ratings) if (Number.isInteger(r) && r >= 1 && r <= 5) counts[5 - r]! += 1;
  return counts;
}

/** `offset` from the query string; null when it is not a whole number in range. */
export function parseReviewsOffset(raw: string | null): number | null {
  if (raw === null || !/^\d{1,5}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_OFFSET ? n : null;
}

export type ReviewsPage = {
  reviews: Review[];
  /** Visible reviews of this provider, all pages. */
  total: number;
};
