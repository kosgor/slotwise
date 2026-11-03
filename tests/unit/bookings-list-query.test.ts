import { describe, expect, it } from "vitest";

import {
  bookingsFilter,
  bookingsHref,
  parseBookingsQuery,
  SEARCH_IN,
} from "@/lib/booking/list-query";

const NOW = new Date("2026-10-29T12:00:00.000Z");

describe("provider bookings list query", () => {
  it("falls back to the defaults and keeps a valid calendar week", () => {
    expect(parseBookingsQuery({})).toEqual({ tab: "upcoming", q: "", page: 1 });
    expect(parseBookingsQuery({ tab: "all", page: "0", week: "next" })).toEqual({
      tab: "upcoming",
      q: "",
      page: 1,
    });
    expect(parseBookingsQuery({ tab: "past", q: " anna ", week: "2026-10-26" })).toEqual({
      tab: "past",
      q: "anna",
      page: 1,
      week: "2026-10-26",
    });
  });

  it("builds links without defaults and round-trips the state", () => {
    expect(bookingsHref(parseBookingsQuery({}))).toBe("/dashboard/bookings");
    const query = parseBookingsQuery({
      tab: "cancelled",
      q: "yoga",
      page: "2",
      week: "2026-10-26",
    });
    const href = bookingsHref(query);
    expect(href).toBe("/dashboard/bookings?tab=cancelled&q=yoga&page=2&week=2026-10-26");
    expect(parseBookingsQuery(new URLSearchParams(href.split("?")[1]))).toEqual(query);
  });

  it("mirrors bookingTab(): a lapsed payment hold is already cancelled", () => {
    const at = '"2026-10-29T12:00:00.000Z"';
    expect(bookingsFilter("cancelled", NOW)).toBe(
      `and(or(status.in.(cancelled,expired),and(status.eq.pending_payment,expires_at.lte.${at})))`,
    );
    const live = `status.not.in.(cancelled,expired),or(status.neq.pending_payment,expires_at.is.null,expires_at.gt.${at})`;
    expect(bookingsFilter("upcoming", NOW)).toBe(`and(and(${live},starts_at.gte.${at}))`);
    expect(bookingsFilter("past", NOW)).toBe(`and(and(${live},starts_at.lt.${at}))`);
  });

  it("adds the search as a requirement, with filter syntax in the term kept as plain text", () => {
    const filter = bookingsFilter("past", NOW, 'a,b) "c" 5%');
    expect(
      filter.endsWith(
        `,or(client_name.ilike."%a,b) \\"c\\" 5\\\\%%",client_email.ilike."%a,b) \\"c\\" 5\\\\%%",service_title.ilike."%a,b) \\"c\\" 5\\\\%%"))`,
      ),
    ).toBe(true);
    expect(filter.startsWith("and(and(")).toBe(true);
  });

  it("searches the client's own columns: professional and service", () => {
    expect(bookingsFilter("upcoming", NOW, "anna", SEARCH_IN.client)).toContain(
      ',or(provider_name.ilike."%anna%",service_title.ilike."%anna%"))',
    );
  });

  it("builds the client's links on /account", () => {
    expect(bookingsHref(parseBookingsQuery({ tab: "past", page: "2" }), "/account")).toBe(
      "/account?tab=past&page=2",
    );
    expect(bookingsHref(parseBookingsQuery({}), "/account")).toBe("/account");
  });
});
