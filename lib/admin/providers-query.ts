// State of the admin "All providers" table, kept in the URL (?q=&status=&sort=&dir=&page=): it works
// without JavaScript, survives a reload and can be shared. Parsing never fails — unknown or broken
// values fall back to the defaults — and links are built back from the parsed state only.

import { z } from "zod";

export const PROVIDERS_PAGE_SIZE = 20;

export const PROVIDER_FILTERS = [
  "all",
  "pending",
  "approved",
  "suspended",
  "rejected",
  "removed",
] as const;
export const PROVIDER_SORTS = ["name", "status", "applied", "reviewed"] as const;
export type ProviderSort = (typeof PROVIDER_SORTS)[number];
export type SortDir = "asc" | "desc";

/** The order a column gets on its first click: names A→Z, dates newest first. */
const DEFAULT_DIR: Record<ProviderSort, SortDir> = {
  name: "asc",
  status: "asc",
  applied: "desc",
  reviewed: "desc",
};

const schema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(PROVIDER_FILTERS).catch("all"),
  sort: z.enum(PROVIDER_SORTS).catch("reviewed"),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ProvidersQuery = {
  q: string;
  status: (typeof PROVIDER_FILTERS)[number];
  sort: ProviderSort;
  dir: SortDir;
  page: number;
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

export function parseProvidersQuery(params: Params): ProvidersQuery {
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

/** /admin with the table state; defaults are left out, so the plain page is just "/admin". */
export function providersHref(query: ProvidersQuery, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.sort !== "reviewed") params.set("sort", query.sort);
  if (query.dir !== DEFAULT_DIR[query.sort]) params.set("dir", query.dir);
  if (query.page > 1) params.set("page", String(query.page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const search = params.toString();
  return search ? `/admin?${search}` : "/admin";
}

/** Clicking a column header: the same column flips its order, another starts at its default. */
export function sortHref(query: ProvidersQuery, sort: ProviderSort): string {
  const dir = query.sort === sort ? (query.dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[sort];
  return providersHref({ ...query, sort, dir, page: 1 });
}

/** A search term as a LIKE pattern: % and _ typed by the admin are literal characters. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
