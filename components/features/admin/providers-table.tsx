import Link from "next/link";

import {
  ApproveForm,
  ReasonDialog,
  RemoveProviderDialog,
} from "@/components/features/admin/review-actions";
import { SortHeader } from "@/components/data-view/sort-header";
import {
  TableLink,
  TableNavigationProvider,
  TableSearch,
  TableViewport,
} from "@/components/data-view/table-navigation";
import { Pagination } from "@/components/features/catalog/pagination";
import { Badge } from "@/components/ui/badge";
import {
  PROVIDER_FILTERS,
  PROVIDERS_PAGE_SIZE,
  providersHref,
  sortHref,
  type ProviderSort,
  type ProvidersQuery,
} from "@/lib/admin/providers-query";
import { CATEGORY_LABELS, type Category } from "@/lib/catalog/types";
import { formatDateTime } from "@/lib/datetime";
import type { Database } from "@/lib/supabase/database.types";

type ProviderStatus = Database["public"]["Enums"]["provider_status"];

export type ProviderRow = {
  id: string;
  slug: string;
  display_name: string;
  category: string;
  city: string;
  status: ProviderStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export const STATUS: Record<ProviderStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-warning text-warning-foreground" },
  approved: { label: "Approved", className: "bg-success text-success-foreground" },
  rejected: { label: "Rejected", className: "bg-muted text-muted-foreground" },
  suspended: { label: "Suspended", className: "bg-destructive text-white" },
  removed: { label: "Removed", className: "bg-muted text-muted-foreground line-through" },
};

const FILTER_LABELS: Record<(typeof PROVIDER_FILTERS)[number], string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  suspended: "Suspended",
  rejected: "Rejected",
  removed: "Removed",
};

const COLUMNS: { sort: ProviderSort; label: string; next: [asc: string, desc: string] }[] = [
  { sort: "name", label: "Name", next: ["A to Z", "Z to A"] },
  { sort: "status", label: "Status", next: ["pending first", "removed first"] },
  { sort: "applied", label: "Applied", next: ["oldest first", "newest first"] },
  { sort: "reviewed", label: "Reviewed", next: ["oldest first", "newest first"] },
];

const utc = (iso: string | null) => (iso ? `${formatDateTime(new Date(iso), "UTC")} UTC` : "—");

/**
 * All providers, pending ones too: search by name, filter by status, sort by any column, 20 per page. The
 * database does the work (lib/admin/providers-query.ts holds the URL state); this only renders.
 */
export function ProvidersTable({
  query,
  rows,
  total,
}: {
  query: ProvidersQuery;
  rows: ProviderRow[];
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PROVIDERS_PAGE_SIZE));
  const first = (query.page - 1) * PROVIDERS_PAGE_SIZE + 1;
  // The other table params (filter, sort), carried by every search.
  const keep = new URLSearchParams(providersHref(query).split("?")[1] ?? "");
  keep.delete("q");
  keep.delete("page");
  const filtered = query.q !== "" || query.status !== "all";
  const view = providersHref(query);

  return (
    <TableNavigationProvider>
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <TableSearch q={query.q} action="/admin" hidden={[...keep]} />

          <nav aria-label="Filter providers by status" className="flex flex-wrap gap-4 text-sm">
            {PROVIDER_FILTERS.map((status) => (
              <TableLink
                key={status}
                href={providersHref({ ...query, status, page: 1 })}
                aria-current={query.status === status ? "page" : undefined}
                className="font-medium underline-offset-4 hover:underline aria-[current=page]:underline"
              >
                {FILTER_LABELS[status]}
              </TableLink>
            ))}
          </nav>
        </div>

        <p role="status" className="text-sm text-muted-foreground">
          {total === 0
            ? "No providers found."
            : `Showing ${first}–${first + rows.length - 1} of ${total}${query.q ? ` matching “${query.q}”` : ""}.`}
        </p>

        <TableViewport view={view} label="All providers">
          {rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              {filtered ? (
                <>
                  <p>Nothing matches this search or filter.</p>
                  <TableLink
                    href={providersHref({ ...query, q: "", status: "all", page: 1 })}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Show all providers
                  </TableLink>
                </>
              ) : (
                <p>No providers yet.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">
                Providers, page {query.page} of {pageCount}
              </caption>
              {/* Sticky: the column headers stay in view while the box scrolls. */}
              <thead className="sticky top-0 z-10 bg-muted text-left">
                <tr>
                  {COLUMNS.map((c) => {
                    const active = query.sort === c.sort;
                    const nextDir = active ? (query.dir === "asc" ? "desc" : "asc") : null;
                    return (
                      <SortHeader
                        key={c.sort}
                        label={c.label}
                        href={sortHref(query, c.sort)}
                        direction={
                          active ? (query.dir === "asc" ? "ascending" : "descending") : undefined
                        }
                        nextLabel={
                          nextDir === "desc"
                            ? c.next[1]
                            : nextDir === "asc"
                              ? c.next[0]
                              : `by ${c.label.toLowerCase()}`
                        }
                        className="p-3 font-medium whitespace-nowrap"
                        LinkComponent={TableLink}
                      />
                    );
                  })}
                  <th scope="col" className="p-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="p-3 text-left font-normal">
                      {p.status === "approved" ? (
                        <Link
                          href={`/pros/${p.slug}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {p.display_name}
                        </Link>
                      ) : (
                        p.display_name
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {CATEGORY_LABELS[p.category as Category]} · {p.city}
                      </span>
                    </th>
                    <td className="p-3">
                      <Badge className={STATUS[p.status].className}>{STATUS[p.status].label}</Badge>
                      {p.review_note && (
                        <span className="mt-1 block max-w-64 text-xs text-muted-foreground">
                          {p.review_note}
                        </span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {utc(p.created_at)}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {utc(p.reviewed_at)}
                    </td>
                    <td className="p-3">
                      {/* Removed is final: nothing left to do with the row. */}
                      {p.status !== "removed" && (
                        <div className="flex items-start justify-end gap-2">
                          {p.status === "approved" ? (
                            <ReasonDialog
                              providerId={p.id}
                              name={p.display_name}
                              decision="suspend"
                            />
                          ) : p.status === "pending" ? (
                            <>
                              <ApproveForm providerId={p.id} name={p.display_name} />
                              <ReasonDialog
                                providerId={p.id}
                                name={p.display_name}
                                decision="reject"
                              />
                            </>
                          ) : (
                            <ApproveForm
                              providerId={p.id}
                              name={p.display_name}
                              label={p.status === "suspended" ? "Reinstate" : "Approve"}
                            />
                          )}
                          <RemoveProviderDialog providerId={p.id} name={p.display_name} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableViewport>

        {/* Always the same height, so the page does not move when the page count changes. */}
        <div className="min-h-10">
          <Pagination
            href={(page) => providersHref({ ...query, page })}
            page={query.page}
            pageCount={pageCount}
            className=""
            LinkComponent={TableLink}
          />
        </div>
      </div>
    </TableNavigationProvider>
  );
}
