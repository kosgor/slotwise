import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { addDays, dateKeyIn, weekDays } from "@/lib/booking/calendar";
import type { Booking } from "@/lib/booking/types";
import { dateKeyToDate, formatDayShort, formatTime, zoneLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/**
 * Week view of bookings in the provider's time zone. Each day is a list (not a positioned grid),
 * so it stays readable on a phone and for screen readers; week navigation is plain links (built by
 * `weekHref`, so the list below keeps its tab and search; `LinkComponent` changes weeks in place).
 */
export function WeekCalendar({
  monday,
  today,
  bookings,
  timeZone,
  weekHref,
  LinkComponent = Link,
}: {
  monday: string;
  today: string;
  bookings: Booking[];
  timeZone: string;
  /** The page URL for a week (its Monday), or for the current week when null. */
  weekHref: (monday: string | null) => string;
  LinkComponent?: React.ComponentType<React.ComponentProps<typeof Link> & { href: string }>;
}) {
  const days = weekDays(monday);
  const byDay = new Map(days.map((d) => [d, [] as Booking[]]));
  for (const b of bookings) byDay.get(dateKeyIn(new Date(b.startsAt), timeZone))?.push(b);
  const label = `${formatDayShort(dateKeyToDate(days[0]!), "UTC")} – ${formatDayShort(dateKeyToDate(days[6]!), "UTC")}`;

  return (
    <div className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h3 className="font-semibold">Week of {label}</h3>
          <p className="text-sm text-muted-foreground">{zoneLabel(timeZone)}</p>
        </div>
        <nav aria-label="Week" className="flex items-center gap-1">
          <LinkComponent
            href={weekHref(addDays(monday, -7))}
            className="inline-flex size-9 items-center justify-center rounded-lg border hover:bg-muted"
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </LinkComponent>
          <LinkComponent
            href={weekHref(null)}
            className="inline-flex h-9 items-center rounded-lg border px-3 text-sm hover:bg-muted"
          >
            This week
          </LinkComponent>
          <LinkComponent
            href={weekHref(addDays(monday, 7))}
            className="inline-flex size-9 items-center justify-center rounded-lg border hover:bg-muted"
            aria-label="Next week"
          >
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </LinkComponent>
        </nav>
      </header>
      <ol className="grid divide-y md:grid-cols-7 md:divide-x md:divide-y-0">
        {days.map((day) => {
          const list = byDay.get(day)!;
          return (
            // On a phone an empty day is one short line ("Mon, Oct 26 · No sessions"), so a quiet
            // week does not take a whole screen; from md up the days are equal columns.
            <li
              key={day}
              className={cn(
                "p-3 md:min-h-28",
                list.length === 0 && "flex items-baseline justify-between gap-2 md:block",
                day === today && "bg-secondary/40",
              )}
            >
              <h4 className="text-sm font-medium">
                {formatDayShort(dateKeyToDate(day), "UTC")}
                {day === today && <span className="ml-1 text-xs text-primary">(today)</span>}
              </h4>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground md:mt-2">No sessions</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {list.map((b) => (
                    <li
                      key={b.id}
                      className={cn(
                        "rounded-md border-l-2 border-primary bg-background px-2 py-1 text-xs",
                        b.status === "cancelled" &&
                          "border-muted-foreground line-through opacity-70",
                      )}
                    >
                      <span className="font-medium">
                        {formatTime(new Date(b.startsAt), timeZone)}
                      </span>{" "}
                      {b.serviceTitle}
                      <span className="block text-muted-foreground">{b.clientName}</span>
                      {b.status === "cancelled" && <span className="sr-only"> (cancelled)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
