import { describe, expect, it } from "vitest";

import { auditHref, auditSearchFilter, parseAuditQuery } from "@/lib/admin/audit-query";

describe("admin audit log query", () => {
  it("falls back to the defaults for missing or broken values", () => {
    expect(parseAuditQuery({})).toEqual({ q: "", action: "all", dir: "desc", page: 1 });
    expect(parseAuditQuery({ action: "provider.approve", dir: "up", page: "x" })).toEqual(
      parseAuditQuery({}),
    );
    expect(parseAuditQuery({ action: "hide", q: [" spam ", "x"] })).toMatchObject({
      action: "hide",
      q: "spam",
    });
  });

  it("builds links without defaults and round-trips the state", () => {
    expect(auditHref(parseAuditQuery({}))).toBe("/admin/audit");
    const query = parseAuditQuery({ q: "anna", action: "remove", dir: "asc", page: "2" });
    const href = auditHref(query);
    expect(href).toBe("/admin/audit?q=anna&action=remove&dir=asc&page=2");
    expect(parseAuditQuery(new URLSearchParams(href.split("?")[1]))).toEqual(query);
  });

  it("searches names and reasons, plus admins found by name, with the term as plain text", () => {
    expect(auditSearchFilter("anna")).toBe(
      'data->>name.ilike."%anna%",data->>note.ilike."%anna%",data->>reason.ilike."%anna%"',
    );
    expect(auditSearchFilter('a,"b"', ["u1", "u2"])).toBe(
      'data->>name.ilike."%a,\\"b\\"%",data->>note.ilike."%a,\\"b\\"%",data->>reason.ilike."%a,\\"b\\"%",actor_id.in.(u1,u2)',
    );
  });
});
