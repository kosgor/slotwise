import { BotIcon, CalendarPlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  TableLink,
  TableNavigationProvider,
  TableSearch,
  TableViewport,
} from "@/components/data-view/table-navigation";
import { BookingCard } from "@/components/features/booking/booking-card";
import { BookingTabs } from "@/components/features/booking/booking-tabs";
import { Pagination } from "@/components/features/catalog/pagination";
import { FlashToast } from "@/components/forms/toasts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import {
  BOOKING_TABS,
  BOOKINGS_PAGE_SIZE,
  bookingsFilter,
  bookingsHref,
  parseBookingsQuery,
  SEARCH_IN,
  type BookingsQuery,
} from "@/lib/booking/list-query";
import { toBooking, type BookingTab } from "@/lib/booking/queries";
import { getPublicSlugsById } from "@/lib/catalog/repository";
import { createClient } from "@/lib/supabase/server";
import { viewerTimeZone } from "@/lib/viewer-timezone";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

const EMPTY: Record<BookingTab, string> = {
  upcoming: "You have no upcoming sessions.",
  past: "No past sessions yet.",
  cancelled: "No cancelled bookings.",
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <Suspense fallback={<AccountSkeleton />}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AccountContent({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const params = await searchParams;
  const user = await requireUser("/account");
  const query = parseBookingsQuery(params);
  const now = new Date();

  // Filtered, searched and paginated in the database, like the provider's list; RLS limits it to
  // this client's bookings anyway. Upcoming soonest first, past and cancelled newest first.
  const supabase = await createClient();
  const matching = (tab: BookingTab, head = false) =>
    supabase
      .from("bookings")
      .select("*", { count: "exact", head })
      .eq("client_id", user.id)
      .or(bookingsFilter(tab, now, query.q, SEARCH_IN.client));
  const from = (query.page - 1) * BOOKINGS_PAGE_SIZE;

  const [page, timeZone, slugs, ...tabCounts] = await Promise.all([
    matching(query.tab)
      .order("starts_at", { ascending: query.tab === "upcoming" })
      .order("id")
      .range(from, from + BOOKINGS_PAGE_SIZE - 1),
    viewerTimeZone(),
    getPublicSlugsById(),
    ...BOOKING_TABS.map((tab) => matching(tab, true)),
  ]);
  const counts = Object.fromEntries(
    BOOKING_TABS.map((tab, i) => [tab, tabCounts[i]?.count ?? 0]),
  ) as Record<BookingTab, number>;
  const total = page.count ?? 0;
  const href = (patch: Partial<BookingsQuery>) => bookingsHref({ ...query, ...patch }, "/account");

  // A page past the end (a booking moved to another tab, a hand-edited URL): the last page.
  const pastEnd =
    page.error?.code === "PGRST103" ||
    (!page.error && query.page > 1 && page.data.length === 0 && total > 0);
  if (pastEnd) redirect(href({ page: Math.max(1, Math.ceil(total / BOOKINGS_PAGE_SIZE)) }));
  if (page.error) throw new Error(`Loading bookings: ${page.error.message}`);

  const bookings = page.data.map(toBooking);
  const pageCount = Math.max(1, Math.ceil(total / BOOKINGS_PAGE_SIZE));
  const first = from + 1;
  const keep = new URLSearchParams(href({ q: "", page: 1 }).split("?")[1] ?? "");

  return (
    <TableNavigationProvider>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {user.role === "provider" ? "Sessions I booked" : "My bookings"}
          </h1>
          <p className="mt-1 text-muted-foreground">Signed in as {displayName(user)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/account/assistant">
              <BotIcon aria-hidden="true" />
              Ask the assistant
            </Link>
          </Button>
          <Button asChild>
            <Link href="/pros">
              <CalendarPlusIcon aria-hidden="true" />
              Book a session
            </Link>
          </Button>
        </div>
      </div>

      {typeof params.booked === "string" && (
        <FlashToast
          message="Your booking is confirmed. You can see it below."
          params={["booked"]}
        />
      )}
      {params.cancelled === "1" && (
        <FlashToast
          params={["cancelled", "refund"]}
          message={
            params.refund === "1"
              ? "The booking was cancelled. A full refund is on its way; banks usually show it within 5–10 business days."
              : params.refund === "pending"
                ? "The booking was cancelled. Your refund will be issued automatically within a few minutes."
                : "The booking was cancelled."
          }
        />
      )}
      {params.passwordUpdated === "1" && (
        <FlashToast message="Your password was updated." params={["passwordUpdated"]} />
      )}

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <BookingTabs
          basePath="/account"
          active={query.tab}
          counts={counts}
          hrefFor={(tab) => href({ tab, page: 1 })}
          LinkComponent={TableLink}
        />
        <TableSearch
          q={query.q}
          action="/account"
          hidden={[...keep]}
          label="Search by professional or service"
        />
      </div>

      <p role="status" className="mt-4 text-sm text-muted-foreground">
        {total === 0
          ? "No bookings found."
          : `Showing ${first}–${first + bookings.length - 1} of ${total}${query.q ? ` matching “${query.q}”` : ""}.`}
      </p>

      <div className="mt-4">
        <TableViewport view={href({})} label="Bookings" flow>
          {bookings.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
              {query.q ? (
                <>
                  <p className="text-muted-foreground">No bookings match “{query.q}”.</p>
                  <TableLink
                    href={href({ q: "", page: 1 })}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Clear the search
                  </TableLink>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">{EMPTY[query.tab]}</p>
                  {query.tab === "upcoming" && (
                    <Button asChild variant="outline">
                      <Link href="/pros">Find a professional</Link>
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-4">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <BookingCard
                    booking={booking}
                    audience="client"
                    timeZone={timeZone}
                    now={now}
                    providerHref={
                      slugs[booking.providerId] ? `/pros/${slugs[booking.providerId]}` : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </TableViewport>
      </div>

      <Pagination
        href={(p) => href({ page: p })}
        page={query.page}
        pageCount={pageCount}
        className="mt-8"
        LinkComponent={TableLink}
      />
    </TableNavigationProvider>
  );
}

function AccountSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading your bookings…
      </span>
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-8 h-9 w-72" />
      <div className="mt-6 space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}
