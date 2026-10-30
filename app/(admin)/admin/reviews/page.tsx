import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminsOnly } from "@/components/features/admin/admin-nav";
import { ReviewsTable } from "@/components/features/admin/reviews-table";
import { TABLE_PAGE_FIT } from "@/components/data-view/table-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdmin } from "@/lib/admin/guard";
import {
  parseReviewsQuery,
  REVIEWS_PAGE_SIZE,
  reviewSearchFilter,
  reviewsHref,
} from "@/lib/admin/reviews-query";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

const SORT_COLUMN = { date: "created_at", rating: "rating", author: "author_name" } as const;

export default function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Reviews searchParams={searchParams} />
    </Suspense>
  );
}

async function Reviews({ searchParams }: Pick<PageProps<"/admin/reviews">, "searchParams">) {
  const params = await searchParams;
  if (!(await getAdmin("/admin/reviews"))) return <AdminsOnly />;
  const query = parseReviewsQuery(params);

  const supabase = await createClient();
  // Filter, search, sort and paginate in the database; ties fall back to newest first and the id,
  // so a row never jumps between pages. A fresh builder each time: query builders are mutable.
  const matching = (head = false) => {
    let q = supabase
      .from("reviews")
      .select(
        "id, author_name, rating, body, hidden, hidden_reason, created_at, providers(display_name)",
        { count: "exact", head },
      );
    if (query.status !== "all") q = q.eq("hidden", query.status === "hidden");
    if (query.q) q = q.or(reviewSearchFilter(query.q));
    return q;
  };
  const from = (query.page - 1) * REVIEWS_PAGE_SIZE;

  const page = await matching()
    .order(SORT_COLUMN[query.sort], { ascending: query.dir === "asc" })
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + REVIEWS_PAGE_SIZE - 1);

  // A page past the end (the last review on it was hidden away, or a hand-edited URL).
  const pastEnd =
    page.error?.code === "PGRST103" ||
    (!page.error && query.page > 1 && page.data.length === 0 && (page.count ?? 0) > 0);
  if (pastEnd) {
    const count = page.count ?? (await matching(true)).count ?? 0;
    const last = Math.max(1, Math.ceil(count / REVIEWS_PAGE_SIZE));
    redirect(reviewsHref({ ...query, page: last }));
  }

  return (
    <div className={cn("flex flex-col gap-6", TABLE_PAGE_FIT)}>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Reviews</h1>
        <p className="mt-1 text-muted-foreground">
          Hide reviews that break the rules. Hidden reviews leave the public profile and the rating;
          every decision goes to the audit log.
        </p>
      </div>
      {page.error ? (
        <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
          Reviews could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <ReviewsTable query={query} rows={page.data} total={page.count ?? 0} />
      )}
    </div>
  );
}
