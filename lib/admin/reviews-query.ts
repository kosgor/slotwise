// State of the admin reviews table, kept in the URL (?q=&status=&sort=&dir=&page=), like the
// providers table (providers-query.ts): it works without JavaScript, survives a reload and can be
// shared. Parsing never fails — broken values fall back to the defaults.

import { z } from "zod";

import { containsPattern, type SortDir } from "@/lib/admin/providers-query";

export const REVIEWS_PAGE_SIZE = 10;

export const REVIEW_FILTERS = ["all", "visible", "hidden"] as const;
export const REVIEW_SORTS = ["date", "rating", "author"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

/** First click: newest first, lowest rating first (what needs a look), names A→Z. */
const DEFAULT_DIR: Record<ReviewSort, SortDir> = { date: "desc", rating: "asc", author: "asc" };

const schema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(REVIEW_FILTERS).catch("all"),
  sort: z.enum(REVIEW_SORTS).catch("date"),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ReviewsQuery = {
  q: string;
  status: (typeof REVIEW_FILTERS)[number];
  sort: ReviewSort;
  dir: SortDir;
  page: number;
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

export function parseReviewsQuery(params: Params): ReviewsQuery {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return (Array.isArray(value) ? value[0] : value) ?? undefined;
  };
  const parsed = schema.parse({
    q: get("q"),
    status: get("status"),
    sort: get("sort"),
    dir: get("dir"),
    page: get("page"),
  });
  return { ...parsed, dir: parsed.dir ?? DEFAULT_DIR[parsed.sort] };
}

/** /admin/reviews with the table state; defaults are left out. */
export function reviewsHref(query: ReviewsQuery, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.sort !== "date") params.set("sort", query.sort);
  if (query.dir !== DEFAULT_DIR[query.sort]) params.set("dir", query.dir);
  if (query.page > 1) params.set("page", String(query.page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const search = params.toString();
  return search ? `/admin/reviews?${search}` : "/admin/reviews";
}

/** Clicking a column header: the same column flips its order, another starts at its default. */
export function reviewSortHref(query: ReviewsQuery, sort: ReviewSort): string {
  const dir = query.sort === sort ? (query.dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[sort];
  return reviewsHref({ ...query, sort, dir, page: 1 });
}

/**
 * PostgREST `or` filter: the author's name or the review text contains the term. The LIKE pattern
 * is escaped first (% _ \), then double-quoted for PostgREST, so commas, dots and parentheses in
 * the term are plain text, never filter syntax.
 */
export function reviewSearchFilter(term: string): string {
  const quoted = `"${containsPattern(term).replace(/[\\"]/g, (c) => `\\${c}`)}"`;
  return `author_name.ilike.${quoted},body.ilike.${quoted}`;
}
