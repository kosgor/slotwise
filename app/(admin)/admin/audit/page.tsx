import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminsOnly } from "@/components/features/admin/admin-nav";
import { AuditTable } from "@/components/features/admin/audit-table";
import { TABLE_PAGE_FIT } from "@/components/data-view/table-layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AUDIT_ACTIONS,
  AUDIT_PAGE_SIZE,
  auditHref,
  auditSearchFilter,
  parseAuditQuery,
} from "@/lib/admin/audit-query";
import { getAdmin } from "@/lib/admin/guard";
import { containsPattern } from "@/lib/admin/providers-query";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };

const ACTIONS: Record<string, string> = {
  "provider.approve": "Approved provider",
  "provider.reject": "Rejected application",
  "provider.suspend": "Suspended provider",
  "provider.remove": "Removed provider",
  "review.hide": "Hid review",
  "review.restore": "Restored review",
};

function details(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, string | null | undefined>;
  const note = d.note ?? d.reason;
  return [d.name, d.from && d.to ? `${d.from} → ${d.to}` : null, note ? `"${note}"` : null]
    .filter(Boolean)
    .join(" · ");
}

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const params = await searchParams;
  if (!(await getAdmin("/admin/audit"))) return <AdminsOnly />;
  const query = parseAuditQuery(params);

  const supabase = await createClient();
  // Admins whose name matches the search: their entries match too (admins read all profiles).
  const { data: actorMatches } = query.q
    ? await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .ilike("full_name", containsPattern(query.q))
        .limit(50)
    : { data: [] };

  // Filter, search and paginate in the database; the id breaks ties within the same instant.
  // A fresh builder each time: query builders are mutable.
  const matching = (head = false) => {
    let q = supabase
      .from("audit_log")
      .select("id, actor_id, action, data, created_at", { count: "exact", head });
    if (query.action !== "all") q = q.eq("action", AUDIT_ACTIONS[query.action]);
    if (query.q)
      q = q.or(
        auditSearchFilter(
          query.q,
          (actorMatches ?? []).map((a) => a.id),
        ),
      );
    return q;
  };
  const from = (query.page - 1) * AUDIT_PAGE_SIZE;
  const ascending = query.dir === "asc";
  const page = await matching()
    .order("created_at", { ascending })
    .order("id", { ascending })
    .range(from, from + AUDIT_PAGE_SIZE - 1);

  // A page past the end (a hand-edited URL, or a narrower search): go to the last page.
  const pastEnd =
    page.error?.code === "PGRST103" ||
    (!page.error && query.page > 1 && page.data.length === 0 && (page.count ?? 0) > 0);
  if (pastEnd) {
    const count = page.count ?? (await matching(true)).count ?? 0;
    redirect(auditHref({ ...query, page: Math.max(1, Math.ceil(count / AUDIT_PAGE_SIZE)) }));
  }

  const entries = page.data ?? [];
  const actorIds = [...new Set(entries.flatMap((e) => (e.actor_id ? [e.actor_id] : [])))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name || "Admin"]));
  const rows = entries.map((e) => ({
    id: e.id,
    who: e.actor_id ? (actorName.get(e.actor_id) ?? "Admin") : "System",
    action: ACTIONS[e.action] ?? e.action,
    details: details(e.data),
    created_at: e.created_at,
  }));

  return (
    <div className={cn("flex flex-col gap-6", TABLE_PAGE_FIT)}>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-muted-foreground">
          Every admin decision, written by the database in the same transaction as the change. It
          cannot be edited or deleted.
        </p>
      </div>
      {page.error ? (
        <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
          The log could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <AuditTable query={query} rows={rows} total={page.count ?? 0} />
      )}
    </div>
  );
}
