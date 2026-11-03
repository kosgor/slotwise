import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CollapsibleSection } from "@/components/data-view/collapsible-section";
import {
  TableLink,
  TableNavigationProvider,
  TableSearch,
  TableViewport,
} from "@/components/data-view/table-navigation";
import { BookingCard } from "@/components/features/booking/booking-card";
import { BookingTabs } from "@/components/features/booking/booking-tabs";
import { Pagination } from "@/components/features/catalog/pagination";
import { NoProviderProfile } from "@/components/features/dashboard/no-provider";
import { WeekCalendar } from "@/components/features/dashboard/week-calendar";
import { FlashToast } from "@/components/forms/toasts";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, dateKeyIn, isDateKey, mondayOf } from "@/lib/booking/calendar";
import {
  BOOKING_TABS,
  BOOKINGS_PAGE_SIZE,
  bookingsFilter,
  bookingsHref,
  parseBookingsQuery,
} from "@/lib/booking/list-query";
import { listProviderBookings, toBooking, type BookingTab } from "@/lib/booking/queries";
import { localDayRange } from "@/lib/booking/slots";
import { getProviderContext } from "@/lib/provider/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bookings", robots: { index: false } };

const EMPTY: Record<BookingTab, string> = {
  upcoming: "No upcoming sessions. New bookings appear here and in the calendar above.",
  past: "No past sessions yet.",
  cancelled: "No cancelled bookings.",
};

export default function ProviderBookingsPage({ searchParams }: PageProps<"/dashboard/bookings">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookings({ searchParams }: Pick<PageProps<"/dashboard/bookings">, "searchParams">) {
  const params = await searchParams;
  const { provider } = await getProviderContext("/dashboard/bookings");
  if (!provider) return <NoProviderProfile />;

  const query = parseBookingsQuery(params);
  const tz = provider.timezone;
  const now = new Date();
  const today = dateKeyIn(now, tz);
  const monday = mondayOf(isDateKey(query.week) ? query.week! : today);
  const weekRange = {
    from: localDayRange(monday, tz).from,
    to: localDayRange(addDays(monday, 7), tz).from,
  };

  // The list is filtered, searched and paginated in the database (lib/booking/list-query.ts);
  // the tab counts follow the search. Upcoming soonest first, past and cancelled newest first.
  const supabase = await createClient();
  const matching = (tab: BookingTab, head = false) =>
    supabase
      .from("bookings")
      .select("*", { count: "exact", head })
      .eq("provider_id", provider.id)
      .or(bookingsFilter(tab, now, query.q));
  const from = (query.page - 1) * BOOKINGS_PAGE_SIZE;
  const ascending = query.tab === "upcoming";

  const [page, week, ...tabCounts] = await Promise.all([
    matching(query.tab)
      .order("starts_at", { ascending })
      .order("id")
      .range(from, from + BOOKINGS_PAGE_SIZE - 1),
    listProviderBookings(provider.id, weekRange),
    ...BOOKING_TABS.map((tab) => matching(tab, true)),
  ]);
  const counts = Object.fromEntries(
    BOOKING_TABS.map((tab, i) => [tab, tabCounts[i]?.count ?? 0]),
  ) as Record<BookingTab, number>;
  const total = page.count ?? 0;

  // A page past the end (bookings moved to another tab, or a hand-edited URL): the last page.
  const pastEnd =
    page.error?.code === "PGRST103" ||
    (!page.error && query.page > 1 && page.data.length === 0 && total > 0);
  if (pastEnd) {
    redirect(bookingsHref({ ...query, page: Math.max(1, Math.ceil(total / BOOKINGS_PAGE_SIZE)) }));
  }
  if (page.error) throw new Error(`Loading bookings: ${page.error.message}`);

  const bookings = page.data.map(toBooking);
  const pageCount = Math.max(1, Math.ceil(total / BOOKINGS_PAGE_SIZE));
  const first = from + 1;
  const keep = new URLSearchParams(bookingsHref({ ...query, q: "", page: 1 }).split("?")[1] ?? "");
  const weekSessions = week.filter((b) => b.status === "confirmed").length;

  return (
    <TableNavigationProvider>
      <div className="space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight">Bookings</h1>
        {params.cancelled === "1" && (
          <FlashToast
            params={["cancelled"]}
            message="The booking was cancelled. The client will see it as cancelled."
          />
        )}

        <CollapsibleSection
          title="Calendar"
          summary={`${weekSessions} ${weekSessions === 1 ? "session" : "sessions"} this week`}
          defaultOpen
        >
          <WeekCalendar
            monday={monday}
            today={today}
            bookings={week}
            timeZone={tz}
            now={now}
            weekHref={(m) => bookingsHref({ ...query, week: m ?? undefined })}
            LinkComponent={TableLink}
          />
        </CollapsibleSection>

        <section aria-labelledby="list-title" className="space-y-4">
          <h2 id="list-title" className="text-xl font-semibold">
            All bookings
          </h2>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <TableSearch
              q={query.q}
              action="/dashboard/bookings"
              hidden={[...keep]}
              label="Search by client or service"
            />
            <BookingTabs
              basePath="/dashboard/bookings"
              active={query.tab}
              counts={counts}
              hrefFor={(tab) => bookingsHref({ ...query, tab, page: 1 })}
              LinkComponent={TableLink}
            />
          </div>

          <p role="status" className="text-sm text-muted-foreground">
            {total === 0
              ? "No bookings found."
              : `Showing ${first}–${first + bookings.length - 1} of ${total}${query.q ? ` matching “${query.q}”` : ""}.`}
          </p>

          <TableViewport view={bookingsHref({ ...query, week: undefined })} label="Bookings">
            {bookings.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                {query.q ? (
                  <>
                    <p>No bookings match “{query.q}”.</p>
                    <TableLink
                      href={bookingsHref({ ...query, q: "", page: 1 })}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Clear the search
                    </TableLink>
                  </>
                ) : (
                  <p>{EMPTY[query.tab]}</p>
                )}
              </div>
            ) : (
              <ul className="space-y-3 p-3">
                {bookings.map((b) => (
                  <li key={b.id}>
                    <BookingCard booking={b} audience="provider" timeZone={tz} now={now} />
                  </li>
                ))}
              </ul>
            )}
          </TableViewport>

          <div className="min-h-10">
            <Pagination
              href={(p) => bookingsHref({ ...query, page: p })}
              page={query.page}
              pageCount={pageCount}
              className=""
              LinkComponent={TableLink}
            />
          </div>
        </section>
      </div>
    </TableNavigationProvider>
  );
}
