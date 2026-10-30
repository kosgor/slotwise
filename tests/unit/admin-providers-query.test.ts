import { describe, expect, it } from "vitest";

import {
  containsPattern,
  parseProvidersQuery,
  providersHref,
  sortHref,
} from "@/lib/admin/providers-query";

describe("admin providers table query", () => {
  it("falls back to the defaults for missing or broken values", () => {
    expect(parseProvidersQuery({})).toEqual({
      q: "",
      status: "all",
      sort: "reviewed",
      dir: "desc",
      page: 1,
    });
    expect(
      parseProvidersQuery({ status: "deleted", sort: "email", dir: "up", page: "-3" }),
    ).toEqual(parseProvidersQuery({}));
    expect(parseProvidersQuery({ page: "2abc" }).page).toBe(1);
    expect(parseProvidersQuery({ q: "x".repeat(101) }).q).toBe("");
  });

  it("reads arrays and URLSearchParams, trims the search", () => {
    expect(parseProvidersQuery({ q: ["  anna ", "other"], page: ["3"] })).toMatchObject({
      q: "anna",
      page: 3,
    });
    expect(parseProvidersQuery(new URLSearchParams("sort=name&dir=desc")).dir).toBe("desc");
    // The "Awaiting review" number links to this filter.
    expect(parseProvidersQuery({ status: "pending" }).status).toBe("pending");
    expect(parseProvidersQuery({ status: "removed" }).status).toBe("removed");
  });

  it("builds links without defaults and round-trips the state", () => {
    expect(providersHref(parseProvidersQuery({}))).toBe("/admin");
    const query = parseProvidersQuery({ q: "anna k", status: "approved", sort: "name", page: "2" });
    const href = providersHref(query);
    expect(href).toBe("/admin?q=anna+k&status=approved&sort=name&page=2");
    expect(parseProvidersQuery(new URLSearchParams(href.split("?")[1]))).toEqual(query);
    expect(providersHref(query, { reviewed: "id" })).toContain("&reviewed=id");
  });

  it("flips the sorted column, starts others at their default, goes back to page 1", () => {
    const byName = parseProvidersQuery({ sort: "name", page: "4" });
    expect(sortHref(byName, "name")).toBe("/admin?sort=name&dir=desc");
    expect(sortHref(byName, "applied")).toBe("/admin?sort=applied");
    expect(sortHref(parseProvidersQuery({}), "reviewed")).toBe("/admin?dir=asc");
  });

  it("treats % and _ in a search as plain characters", () => {
    expect(containsPattern("anna")).toBe("%anna%");
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
