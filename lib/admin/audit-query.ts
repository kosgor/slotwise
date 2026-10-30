// State of the admin audit log table, kept in the URL (?q=&action=&dir=&page=), like the providers
// and reviews tables: works without JavaScript, survives a reload, can be shared. Parsing never fails.

import { z } from "zod";

import { containsPattern, type SortDir } from "@/lib/admin/providers-query";

export const AUDIT_PAGE_SIZE = 10;

/** Filter key → the action stored in audit_log (written by the SQL functions). */
export const AUDIT_ACTIONS = {
  approve: "provider.approve",
  reject: "provider.reject",
  suspend: "provider.suspend",
  remove: "provider.remove",
  hide: "review.hide",
  restore: "review.restore",
} as const;
export type AuditFilter = "all" | keyof typeof AUDIT_ACTIONS;
export const AUDIT_FILTERS = ["all", ...Object.keys(AUDIT_ACTIONS)] as AuditFilter[];

const schema = z.object({
  q: z.string().trim().max(100).catch(""),
  action: z.enum(AUDIT_FILTERS as [AuditFilter, ...AuditFilter[]]).catch("all"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type AuditQuery = { q: string; action: AuditFilter; dir: SortDir; page: number };

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

export function parseAuditQuery(params: Params): AuditQuery {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return (Array.isArray(value) ? value[0] : value) ?? undefined;
  };
  return schema.parse({ q: get("q"), action: get("action"), dir: get("dir"), page: get("page") });
}

/** /admin/audit with the table state; defaults (everything, newest first, page 1) are left out. */
export function auditHref(query: AuditQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.action !== "all") params.set("action", query.action);
  if (query.dir !== "desc") params.set("dir", query.dir);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `/admin/audit?${search}` : "/admin/audit";
}

/**
 * PostgREST `or` filter: the provider's name, the reason, or one of the admins found by name. The
 * term is escaped for LIKE and quoted for PostgREST (see reviewSearchFilter); actor ids are uuids
 * read from the database, never from the URL.
 */
export function auditSearchFilter(term: string, actorIds: string[] = []): string {
  const quoted = `"${containsPattern(term).replace(/[\\"]/g, (c) => `\\${c}`)}"`;
  const parts = ["data->>name", "data->>note", "data->>reason"].map((c) => `${c}.ilike.${quoted}`);
  if (actorIds.length) parts.push(`actor_id.in.(${actorIds.join(",")})`);
  return parts.join(",");
}
