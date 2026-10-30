import { describe, expect, it } from "vitest";

import {
  parseReviewsQuery,
  reviewSearchFilter,
  reviewSortHref,
  reviewsHref,
} from "@/lib/admin/reviews-query";

describe("admin reviews table query", () => {
  it("falls back to the defaults for missing or broken values", () => {
    expect(parseReviewsQuery({})).toEqual({
      q: "",
      status: "all",
      sort: "date",
      dir: "desc",
      page: 1,
    });
    expect(parseReviewsQuery({ status: "deleted", sort: "body", dir: "up", page: "0" })).toEqual(
      parseReviewsQuery({}),
    );
    expect(parseReviewsQuery({ q: ["  rude ", "x"], status: "hidden" })).toMatchObject({
      q: "rude",
      status: "hidden",
    });
  });

  it("builds links without defaults and round-trips the state", () => {
    expect(reviewsHref(parseReviewsQuery({}))).toBe("/admin/reviews");
    const query = parseReviewsQuery({ q: "great", status: "visible", sort: "rating", page: "3" });
    const href = reviewsHref(query);
    expect(href).toBe("/admin/reviews?q=great&status=visible&sort=rating&page=3");
    expect(parseReviewsQuery(new URLSearchParams(href.split("?")[1]))).toEqual(query);
    expect(reviewsHref(query, { moderated: "id" })).toContain("&moderated=id");
  });

  it("flips the sorted column, starts others at their default, goes back to page 1", () => {
    const byDate = parseReviewsQuery({ page: "2" });
    expect(reviewSortHref(byDate, "date")).toBe("/admin/reviews?dir=asc");
    // Lowest ratings first: the ones worth a look.
    expect(reviewSortHref(byDate, "rating")).toBe("/admin/reviews?sort=rating");
    expect(reviewSortHref(parseReviewsQuery({ sort: "author" }), "author")).toBe(
      "/admin/reviews?sort=author&dir=desc",
    );
  });

  it("searches the name and the text, with filter syntax in the term kept as plain text", () => {
    expect(reviewSearchFilter("anna")).toBe('author_name.ilike."%anna%",body.ilike."%anna%"');
    // A comma or parenthesis would end the filter, a quote the value, % _ would be wildcards.
    expect(reviewSearchFilter('a,b) "c" 5%')).toBe(
      'author_name.ilike."%a,b) \\"c\\" 5\\\\%%",body.ilike."%a,b) \\"c\\" 5\\\\%%"',
    );
  });
});
