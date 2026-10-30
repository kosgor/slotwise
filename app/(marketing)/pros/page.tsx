import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ActiveFilters } from "@/components/features/catalog/active-filters";
import { CatalogFilters, FILTERS_FORM_ID } from "@/components/features/catalog/catalog-filters";
import { CleanGetForm } from "@/components/features/catalog/clean-get-form";
import { MobileFilters } from "@/components/features/catalog/mobile-filters";
import { Pagination } from "@/components/features/catalog/pagination";
import { ProviderCard } from "@/components/features/catalog/provider-card";
import { SortSelect } from "@/components/features/catalog/sort-select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pluralize } from "@/lib/catalog/format";
import { catalogHref, hasActiveFilters, parseCatalogQuery } from "@/lib/catalog/query";
import { getCatalogStats, searchProviders } from "@/lib/catalog/repository";

export const metadata: Metadata = {
  title: "Find a professional",
  description:
    "Browse tutors, fitness trainers, yoga teachers, coaches, massage therapists and music teachers. Filter by city, price and online or in-person sessions.",
  alternates: { canonical: "/pros" },
};

export default function CatalogPage({ searchParams }: PageProps<"/pros">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* Static shell: prerendered and sent instantly. */}
      <h1 className="text-3xl font-semibold tracking-tight">Find a professional</h1>
      <p className="mt-2 text-muted-foreground">
        Real availability, clear prices, verified reviews.
      </p>
      {/* searchParams are only known at request time, so this part streams in behind Suspense. */}
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CatalogResults({ searchParams }: Pick<PageProps<"/pros">, "searchParams">) {
  const query = parseCatalogQuery(await searchParams);
  const [result, stats] = await Promise.all([searchProviders(query), getCatalogStats()]);
  const filtered = hasActiveFilters(query);
  const activeCount = [
    query.q,
    query.category,
    query.city,
    query.format,
    query.minPrice,
    query.maxPrice,
  ].filter((v) => v !== undefined).length;
  // Remount the forms when the URL changes so defaultValue reflects the new filters (e.g. after a chip is removed).
  const formKey = catalogHref(query);

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <CleanGetForm className="sticky top-24 rounded-xl border bg-card p-5">
          <CatalogFilters
            key={formKey}
            query={query}
            cities={stats.cities}
            idPrefix="desktop"
            formId={FILTERS_FORM_ID}
          />
        </CleanGetForm>
      </aside>

      <section aria-labelledby="results-title">
        <h2 id="results-title" className="sr-only">
          Results
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MobileFilters activeCount={activeCount}>
              <CleanGetForm>
                <CatalogFilters
                  key={formKey}
                  query={query}
                  cities={stats.cities}
                  idPrefix="mobile"
                />
              </CleanGetForm>
            </MobileFilters>
            {/* role="status": screen readers announce the new count after each filter change. */}
            <p role="status" className="text-sm text-muted-foreground">
              {pluralize(result.total, "professional", "professionals")} found
            </p>
          </div>
          <SortSelect key={formKey} value={query.sort} formId={FILTERS_FORM_ID} />
        </div>

        <div className="mt-4">
          <ActiveFilters query={query} />
        </div>

        {result.items.length > 0 ? (
          <>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((provider) => (
                <li key={provider.id}>
                  <ProviderCard provider={provider} />
                </li>
              ))}
            </ul>
            <Pagination
              href={(page) => catalogHref({ ...query, page })}
              page={result.page}
              pageCount={result.pageCount}
            />
          </>
        ) : (
          <EmptyState filtered={filtered} />
        )}
      </section>
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
      <h3 className="text-lg font-semibold">No professionals match these filters</h3>
      <p className="mt-2 text-muted-foreground">
        Try a wider price range, another city, or switch between online and in-person sessions.
      </p>
      {filtered && (
        <Button asChild variant="outline" className="mt-6">
          <Link href="/pros">Clear all filters</Link>
        </Button>
      )}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading professionals…
      </span>
      <Skeleton className="hidden h-96 rounded-xl lg:block" />
      <div>
        <Skeleton className="h-10 w-56" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-60 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
