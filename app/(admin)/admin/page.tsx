import { TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminsOnly } from "@/components/features/admin/admin-nav";
import { CollapsibleSection } from "@/components/data-view/collapsible-section";
import { ProvidersTable } from "@/components/features/admin/providers-table";
import { ApproveForm, ReasonDialog } from "@/components/features/admin/review-actions";
import { Skeleton } from "@/components/ui/skeleton";
import {
  containsPattern,
  parseProvidersQuery,
  PROVIDERS_PAGE_SIZE,
  providersHref,
} from "@/lib/admin/providers-query";
import { requireUser } from "@/lib/auth/guards";
import { CATEGORY_LABELS, type Category } from "@/lib/catalog/types";
import { formatDateTime } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const SORT_COLUMN = {
  name: "display_name",
  status: "status",
  applied: "created_at",
  reviewed: "reviewed_at",
} as const;

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Admin searchParams={searchParams} />
    </Suspense>
  );
}

async function Admin({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const params = await searchParams;
  const user = await requireUser("/admin");
  // Role check on the server. Even without it, RLS would return only the user's own rows and
  // review_provider() would refuse — the page is not the protection, it avoids an empty screen.
  if (user.role !== "admin") return <AdminsOnly />;

  const query = parseProvidersQuery(params);

  const supabase = await createClient();

  // The table page: every provider, pending ones too (so its counts match the numbers above).
  // Filter, search, sort and paginate in the database; ties are broken by name and id, so a row
  // never jumps between pages. A fresh builder each time: Supabase query builders are mutable.
  const matching = (head = false) => {
    let q = supabase
      .from("providers")
      .select(
        "id, slug, display_name, category, city, status, review_note, reviewed_at, created_at",
        { count: "exact", head },
      );
    if (query.status !== "all") q = q.eq("status", query.status);
    if (query.q) q = q.ilike("display_name", containsPattern(query.q));
    return q;
  };
  const from = (query.page - 1) * PROVIDERS_PAGE_SIZE;

  const [page, pendingResult, providerCount, bookings] = await Promise.all([
    matching()
      .order(SORT_COLUMN[query.sort], { ascending: query.dir === "asc", nullsFirst: false })
      .order("display_name")
      .order("id")
      .range(from, from + PROVIDERS_PAGE_SIZE - 1),
    supabase
      .from("providers")
      .select("id, display_name, headline, bio, category, city, created_at, services(active)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase.from("providers").select("id", { count: "exact", head: true }),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed"),
  ]);

  // A page past the end (rows were reviewed away, or a hand-edited URL): an empty page while rows
  // exist — or, from some PostgREST versions, "range not satisfiable". Go to the last page.
  const pastEnd =
    page.error?.code === "PGRST103" ||
    (!page.error && query.page > 1 && page.data.length === 0 && (page.count ?? 0) > 0);
  if (pastEnd) {
    const count = page.count ?? (await matching(true)).count ?? 0;
    const last = Math.max(1, Math.ceil(count / PROVIDERS_PAGE_SIZE));
    redirect(providersHref({ ...query, page: last }));
  }
  if (page.error) throw new Error(`Loading providers: ${page.error.message}`);

  const pending = (pendingResult.data ?? []).map((p) => ({
    ...p,
    activeServices: p.services.filter((s) => s.active).length,
  }));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-muted-foreground">
          Review provider applications. Every decision is checked again in the database.
        </p>
      </div>

      {/* Each number opens its list: the first two filter the table below (search and page reset,
          sort kept), bookings live on the dashboard. */}
      <ul className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Providers",
            value: providerCount.count ?? 0,
            href: `${providersHref({ ...query, q: "", status: "all", page: 1 })}#all-providers`,
            current: query.status === "all" && !query.q,
          },
          {
            label: "Awaiting review",
            value: pending.length,
            href: `${providersHref({ ...query, q: "", status: "pending", page: 1 })}#all-providers`,
            current: query.status === "pending" && !query.q,
          },
          {
            label: "Confirmed bookings",
            value: bookings.count ?? 0,
            href: "/admin/dashboard",
            current: false,
          },
        ].map((stat) => (
          <li key={stat.label}>
            <Link
              href={stat.href}
              aria-current={stat.current ? "true" : undefined}
              className="block rounded-xl border bg-card p-5 outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 aria-current:border-primary aria-current:ring-1 aria-current:ring-primary"
            >
              <span className="block text-sm text-muted-foreground">{stat.label}</span>
              <span className="mt-1 block text-2xl font-semibold">{stat.value}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="pending-title">
        <h2 id="pending-title" className="text-xl font-semibold">
          Applications awaiting review
        </h2>
        {pending.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            No pending applications.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {pending.map((p) => (
              <li key={p.id}>
                <article
                  aria-labelledby={`app-${p.id}`}
                  className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <h3 id={`app-${p.id}`} className="font-semibold">
                      {p.display_name}
                    </h3>
                    <p className="text-sm">{p.headline}</p>
                    {p.bio && <p className="line-clamp-3 text-sm text-muted-foreground">{p.bio}</p>}
                    <p className="text-sm text-muted-foreground">
                      {CATEGORY_LABELS[p.category as Category]} · {p.city} · applied{" "}
                      {formatDateTime(new Date(p.created_at), "UTC")} UTC · {p.activeServices}{" "}
                      active {p.activeServices === 1 ? "service" : "services"}
                    </p>
                    {p.activeServices === 0 && (
                      <p className="flex items-center gap-1.5 text-sm">
                        <TriangleAlertIcon className="size-4 text-warning" aria-hidden="true" />
                        No active services yet: once approved, the profile appears in the catalog
                        after the first service is added.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <ApproveForm providerId={p.id} name={p.display_name} />
                    <ReasonDialog providerId={p.id} name={p.display_name} decision="reject" />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Open by default; the stat tiles link here and open it again if it was folded. */}
      <CollapsibleSection
        id="all-providers"
        title="All providers"
        summary={`${providerCount.count ?? 0} in total`}
        defaultOpen
      >
        <ProvidersTable query={query} rows={page.data ?? []} total={page.count ?? 0} />
      </CollapsibleSection>
    </div>
  );
}
