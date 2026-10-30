import { HideReviewDialog, RestoreReviewForm } from "@/components/features/admin/review-actions";
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
  REVIEW_FILTERS,
  REVIEWS_PAGE_SIZE,
  reviewSortHref,
  reviewsHref,
  type ReviewSort,
  type ReviewsQuery,
} from "@/lib/admin/reviews-query";
import { formatDateTime } from "@/lib/datetime";

export type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  body: string;
  hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
  providers: { display_name: string } | null;
};

const FILTER_LABELS: Record<(typeof REVIEW_FILTERS)[number], string> = {
  all: "All",
  visible: "Visible",
  hidden: "Hidden",
};

const COLUMNS: { sort: ReviewSort; label: string; next: [asc: string, desc: string] }[] = [
  // Sorted by author: the cell starts with their name.
  { sort: "author", label: "Review", next: ["author A to Z", "author Z to A"] },
  { sort: "rating", label: "Rating", next: ["lowest first", "highest first"] },
  { sort: "date", label: "Date (UTC)", next: ["oldest first", "newest first"] },
];

/**
 * Every review, hidden ones too: search by author or text, filter by visibility, sort, 10 per page.
 * The database does the work (lib/admin/reviews-query.ts holds the URL state); this only renders.
 */
export function ReviewsTable({
  query,
  rows,
  total,
}: {
  query: ReviewsQuery;
  rows: ReviewRow[];
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));
  const first = (query.page - 1) * REVIEWS_PAGE_SIZE + 1;
  // The other table params (filter, sort), carried by every search.
  const keep = new URLSearchParams(reviewsHref(query).split("?")[1] ?? "");
  keep.delete("q");
  keep.delete("page");
  const filtered = query.q !== "" || query.status !== "all";

  return (
    <TableNavigationProvider>
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <TableSearch
            q={query.q}
            action="/admin/reviews"
            hidden={[...keep]}
            label="Search by author or text"
          />
          <nav aria-label="Filter reviews" className="flex flex-wrap gap-4 text-sm">
            {REVIEW_FILTERS.map((status) => (
              <TableLink
                key={status}
                href={reviewsHref({ ...query, status, page: 1 })}
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
            ? "No reviews found."
            : `Showing ${first}–${first + rows.length - 1} of ${total}${query.q ? ` matching “${query.q}”` : ""}.`}
        </p>

        <TableViewport view={reviewsHref(query)} label="Reviews" fit>
          {rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              {filtered ? (
                <>
                  <p>Nothing matches this search or filter.</p>
                  <TableLink
                    href={reviewsHref({ ...query, q: "", status: "all", page: 1 })}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Show all reviews
                  </TableLink>
                </>
              ) : (
                <p>No reviews yet.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">
                Reviews, page {query.page} of {pageCount}
              </caption>
              <thead className="sticky top-0 z-10 bg-muted text-left">
                <tr>
                  {COLUMNS.map((c) => {
                    const active = query.sort === c.sort;
                    const nextDir = active ? (query.dir === "asc" ? "desc" : "asc") : null;
                    return (
                      <SortHeader
                        key={c.sort}
                        label={c.label}
                        href={reviewSortHref(query, c.sort)}
                        direction={
                          active ? (query.dir === "asc" ? "ascending" : "descending") : undefined
                        }
                        nextLabel={
                          nextDir === "desc"
                            ? c.next[1]
                            : nextDir === "asc"
                              ? c.next[0]
                              : `by ${c.sort}`
                        }
                        className="p-3 font-medium whitespace-nowrap"
                        LinkComponent={TableLink}
                      />
                    );
                  })}
                  <th scope="col" className="p-3 font-medium">
                    Professional
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <th scope="row" className="max-w-md min-w-56 p-3 text-left font-normal">
                      <span className="font-medium">{r.author_name}</span>
                      {r.hidden && (
                        <Badge variant="outline" className="ml-2">
                          Hidden
                        </Badge>
                      )}
                      <span className="mt-1 line-clamp-3 block text-muted-foreground">
                        {r.body}
                      </span>
                      {r.hidden && r.hidden_reason && (
                        <span className="mt-1 block text-xs">Reason: {r.hidden_reason}</span>
                      )}
                    </th>
                    <td className="p-3 whitespace-nowrap">
                      {r.rating}
                      <span className="text-muted-foreground"> / 5</span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(new Date(r.created_at), "UTC")}
                    </td>
                    <td className="p-3">{r.providers?.display_name ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex justify-end">
                        {r.hidden ? (
                          <RestoreReviewForm reviewId={r.id} author={r.author_name} />
                        ) : (
                          <HideReviewDialog reviewId={r.id} author={r.author_name} />
                        )}
                      </div>
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
            href={(page) => reviewsHref({ ...query, page })}
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
