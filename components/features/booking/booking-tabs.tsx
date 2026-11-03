import Link from "next/link";

import type { BookingTab } from "@/lib/booking/queries";
import { cn } from "@/lib/utils";

const TABS: { id: BookingTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
];

/**
 * Filters as links (?tab=…), not a JS tab widget: each list is its own URL, works without
 * JavaScript and can be bookmarked. aria-current marks the active one.
 */
export function BookingTabs({
  basePath,
  active,
  counts,
  hrefFor,
  LinkComponent = Link,
}: {
  basePath: string;
  active: BookingTab;
  counts: Record<BookingTab, number>;
  /** Builds each tab's URL when the list has more state to keep (search, calendar week). */
  hrefFor?: (tab: BookingTab) => string;
  /** E.g. TableLink, to switch tabs in place. */
  LinkComponent?: React.ComponentType<React.ComponentProps<typeof Link> & { href: string }>;
}) {
  return (
    <nav aria-label="Booking filters">
      <ul className="inline-flex rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <li key={tab.id}>
            <LinkComponent
              href={
                hrefFor
                  ? hrefFor(tab.id)
                  : tab.id === "upcoming"
                    ? basePath
                    : `${basePath}?tab=${tab.id}`
              }
              aria-current={tab.id === active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                tab.id === active && "bg-background text-foreground shadow-sm",
              )}
            >
              {tab.label}
              <span className="text-xs tabular-nums">({counts[tab.id]})</span>
            </LinkComponent>
          </li>
        ))}
      </ul>
    </nav>
  );
}
