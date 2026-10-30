import { SortHeader } from "@/components/data-view/sort-header";
import {
  TableLink,
  TableNavigationProvider,
  TableSearch,
  TableViewport,
} from "@/components/data-view/table-navigation";
import { Pagination } from "@/components/features/catalog/pagination";
import {
  AUDIT_FILTERS,
  AUDIT_PAGE_SIZE,
  auditHref,
  type AuditFilter,
  type AuditQuery,
} from "@/lib/admin/audit-query";
import { formatDateTime } from "@/lib/datetime";

export type AuditRow = {
  id: number;
  who: string;
  action: string;
  details: string;
  created_at: string;
};

const FILTER_LABELS: Record<AuditFilter, string> = {
  all: "All",
  approve: "Approved",
  reject: "Rejected",
  suspend: "Suspended",
  remove: "Removed",
  hide: "Hid review",
  restore: "Restored review",
};

/**
 * The audit log: search by provider name, reason or admin, filter by action, newest or oldest
 * first, 10 per page. The database does the work (lib/admin/audit-query.ts holds the URL state).
 */
export function AuditTable({
  query,
  rows,
  total,
}: {
  query: AuditQuery;
  rows: AuditRow[];
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const first = (query.page - 1) * AUDIT_PAGE_SIZE + 1;
  const keep = new URLSearchParams(auditHref({ ...query, q: "", page: 1 }).split("?")[1] ?? "");
  const filtered = query.q !== "" || query.action !== "all";
  const ascending = query.dir === "asc";

  return (
    <TableNavigationProvider>
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <TableSearch
            q={query.q}
            action="/admin/audit"
            hidden={[...keep]}
            label="Search by name, reason or admin"
          />
          <nav aria-label="Filter by action" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {AUDIT_FILTERS.map((action) => (
              <TableLink
                key={action}
                href={auditHref({ ...query, action, page: 1 })}
                aria-current={query.action === action ? "page" : undefined}
                className="font-medium underline-offset-4 hover:underline aria-[current=page]:underline"
              >
                {FILTER_LABELS[action]}
              </TableLink>
            ))}
          </nav>
        </div>

        <p role="status" className="text-sm text-muted-foreground">
          {total === 0
            ? "No entries found."
            : `Showing ${first}–${first + rows.length - 1} of ${total}${query.q ? ` matching “${query.q}”` : ""}.`}
        </p>

        <TableViewport view={auditHref(query)} label="Audit log" fit>
          {rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              {filtered ? (
                <>
                  <p>Nothing matches this search or filter.</p>
                  <TableLink
                    href={auditHref({ ...query, q: "", action: "all", page: 1 })}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Show the whole log
                  </TableLink>
                </>
              ) : (
                <p>Nothing logged yet.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">
                Audit log, {ascending ? "oldest" : "newest"} first, page {query.page} of {pageCount}
              </caption>
              <thead className="sticky top-0 z-10 bg-muted text-left">
                <tr>
                  <SortHeader
                    label="When (UTC)"
                    direction={ascending ? "ascending" : "descending"}
                    href={auditHref({ ...query, dir: ascending ? "desc" : "asc", page: 1 })}
                    className="p-3 font-medium whitespace-nowrap"
                    LinkComponent={TableLink}
                  />
                  <th scope="col" className="p-3 font-medium">
                    Who
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Action
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((e) => (
                  <tr key={e.id} className="align-top">
                    <th scope="row" className="p-3 text-left font-normal whitespace-nowrap">
                      {formatDateTime(new Date(e.created_at), "UTC")}
                    </th>
                    <td className="p-3 whitespace-nowrap">{e.who}</td>
                    <td className="p-3 whitespace-nowrap">{e.action}</td>
                    <td className="min-w-56 p-3 text-muted-foreground">{e.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableViewport>

        <div className="min-h-10">
          <Pagination
            href={(page) => auditHref({ ...query, page })}
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
