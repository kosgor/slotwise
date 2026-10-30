import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const ITEM =
  "inline-flex size-9 sm:size-10 items-center justify-center rounded-lg border text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The page numbers to show, gaps as null: all of them when they fit in `slots`, otherwise the first,
 * the last and the current one with its neighbours ("1 … 4 5 6 … 40"; with 5 slots "1 … 5 … 40").
 * Always exactly `slots` items, so the row keeps its width while paging.
 */
export function pageWindow(page: number, pageCount: number, slots: 5 | 7 = 7): (number | null)[] {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (pageCount <= slots) return range(1, pageCount);
  const end = slots - 2; // numbers in a row next to either end
  const around = (slots - 5) / 2; // neighbours on each side of the current page
  if (page < end) return [...range(1, end), null, pageCount];
  if (page > pageCount - end + 1) return [1, null, ...range(pageCount - end + 1, pageCount)];
  return [1, null, ...range(page - around, page + around), null, pageCount];
}

/** Page links; `href` builds the URL of a page, so each list keeps its own filters and sort. */
export function Pagination({
  href,
  page,
  pageCount,
  className = "mt-10",
  LinkComponent = Link,
}: {
  href: (page: number) => string;
  page: number;
  pageCount: number;
  className?: string;
  /** E.g. the admin TableLink, to change pages in place. */
  LinkComponent?: React.ComponentType<React.ComponentProps<typeof Link> & { href: string }>;
}) {
  if (pageCount <= 1) return null;
  // Phones get the 5-slot row (7 items with the arrows fit in 343px), wider screens the 7-slot one.
  // The hidden list is display:none, so screen readers and keyboards meet only one.
  return (
    <nav aria-label="Pagination" className={cn("flex justify-center", className)}>
      <PageList
        {...{ href, page, pageCount, LinkComponent }}
        slots={5}
        // Seven 36px items with 4px gaps fit a 320px screen (WCAG reflow); 40px from sm up.
        className="flex gap-1 sm:hidden"
      />
      <PageList
        {...{ href, page, pageCount, LinkComponent }}
        slots={7}
        className="hidden sm:flex"
      />
    </nav>
  );
}

function PageList({
  href,
  page,
  pageCount,
  LinkComponent,
  slots,
  className,
}: {
  href: (page: number) => string;
  page: number;
  pageCount: number;
  LinkComponent: React.ComponentType<React.ComponentProps<typeof Link> & { href: string }>;
  slots: 5 | 7;
  className: string;
}) {
  const pages = pageWindow(page, pageCount, slots);
  return (
    <ul className={cn("items-center gap-2", className)}>
      <li>
        {page > 1 ? (
          <LinkComponent
            href={href(page - 1)}
            className={cn(ITEM, "hover:bg-muted")}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </LinkComponent>
        ) : (
          <span className={cn(ITEM, "opacity-40")} aria-hidden="true">
            <ChevronLeftIcon className="size-4" />
          </span>
        )}
      </li>
      {pages.map((p, i) =>
        p === null ? (
          <li key={`gap-${i}`} aria-hidden="true" className="w-6 text-center text-muted-foreground">
            …
          </li>
        ) : (
          <li key={p}>
            <LinkComponent
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              className={cn(
                ITEM,
                p === page ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {p}
            </LinkComponent>
          </li>
        ),
      )}
      <li>
        {page < pageCount ? (
          <LinkComponent
            href={href(page + 1)}
            className={cn(ITEM, "hover:bg-muted")}
            aria-label="Next page"
          >
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </LinkComponent>
        ) : (
          <span className={cn(ITEM, "opacity-40")} aria-hidden="true">
            <ChevronRightIcon className="size-4" />
          </span>
        )}
      </li>
    </ul>
  );
}
