// State of the provider's bookings list, kept in the URL (?tab=&q=&page=&week=), like the admin
// tables: it works without JavaScript, survives a reload and can be shared. Parsing never fails.
// The tab filters mirror bookingTab() (lib/booking/queries.ts), so the database returns exactly
// the bookings the old in-memory filter showed — including a payment hold whose 15 minutes are
// over but that the expiry job has not marked yet: it is already "cancelled".

import { z } from "zod";

import type { BookingTab } from "@/lib/booking/queries";

export const BOOKINGS_PAGE_SIZE = 10;
export const BOOKING_TABS = ["upcoming", "past", "cancelled"] as const satisfies BookingTab[];

const schema = z.object({
  tab: z.enum(BOOKING_TABS).catch("upcoming"),
  q: z.string().trim().max(100).catch(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type BookingsQuery = z.infer<typeof schema> & { week?: string };

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

export function parseBookingsQuery(params: Params): BookingsQuery {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return (Array.isArray(value) ? value[0] : value) ?? undefined;
  };
  const week = get("week");
  return {
    ...schema.parse({ tab: get("tab"), q: get("q"), page: get("page") }),
    ...(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? { week } : {}),
  };
}

/** /dashboard/bookings with the list state; defaults are left out. The calendar week is kept. */
export function bookingsHref(query: BookingsQuery): string {
  const params = new URLSearchParams();
  if (query.tab !== "upcoming") params.set("tab", query.tab);
  if (query.q) params.set("q", query.q);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.week) params.set("week", query.week);
  const search = params.toString();
  return search ? `/dashboard/bookings?${search}` : "/dashboard/bookings";
}

/** A PostgREST value in double quotes: commas, dots and parentheses stay plain text. */
function quoted(value: string): string {
  return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** LIKE pattern for "contains", with % _ \ in the term matched literally. */
function contains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * One PostgREST `or` filter for a tab (and the search, if any), to pass to `.or()`. A single
 * expression because supabase-js joins several `.or()` calls into one `or` parameter, which would
 * turn the tab's conditions and the search into alternatives instead of requirements.
 */
export function bookingsFilter(tab: BookingTab, now: Date, q = ""): string {
  const at = quoted(now.toISOString());
  // A hold is over once its time is up, before the job marks it "expired".
  const lapsed = `and(status.eq.pending_payment,expires_at.lte.${at})`;
  const cancelled = `or(status.in.(cancelled,expired),${lapsed})`;
  const live = `status.not.in.(cancelled,expired),or(status.neq.pending_payment,expires_at.is.null,expires_at.gt.${at})`;
  const condition =
    tab === "cancelled"
      ? cancelled
      : `and(${live},starts_at.${tab === "upcoming" ? "gte" : "lt"}.${at})`;
  if (!q) return `and(${condition})`;
  const like = quoted(contains(q));
  const search = `or(client_name.ilike.${like},client_email.ilike.${like},service_title.ilike.${like})`;
  return `and(${condition},${search})`;
}
