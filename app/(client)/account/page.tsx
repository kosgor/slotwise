import { BotIcon, CalendarPlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BookingCard } from "@/components/features/booking/booking-card";
import { BookingTabs, parseTab } from "@/components/features/booking/booking-tabs";
import { FlashToast } from "@/components/forms/toasts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { bookingTab, listClientBookings, type BookingTab } from "@/lib/booking/queries";
import { getPublicSlugsById } from "@/lib/catalog/repository";
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
  const [bookings, timeZone, slugs] = await Promise.all([
    listClientBookings(user.id),
    viewerTimeZone(),
    getPublicSlugsById(),
  ]);
  const now = new Date();
  const tab = parseTab(params.tab);
  const counts = { upcoming: 0, past: 0, cancelled: 0 };
  for (const b of bookings) counts[bookingTab(b, now)]++;
  // Past sessions newest first; upcoming soonest first.
  const visible = bookings.filter((b) => bookingTab(b, now) === tab);
  if (tab !== "upcoming") visible.reverse();

  return (
    <>
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

      <div className="mt-8">
        <BookingTabs basePath="/account" active={tab} counts={counts} />
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground">{EMPTY[tab]}</p>
          {tab === "upcoming" && (
            <Button asChild variant="outline" className="mt-4">
              <Link href="/pros">Find a professional</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {visible.map((booking) => (
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
    </>
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
