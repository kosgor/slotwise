import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PaymentStatus } from "@/components/features/booking/payment-status";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/guards";
import { toBooking } from "@/lib/booking/queries";
import { formatDuration, formatPrice } from "@/lib/catalog/format";
import { formatDateTime, zoneLabel } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import { viewerTimeZone } from "@/lib/viewer-timezone";

export const metadata: Metadata = { title: "Booking payment", robots: { index: false } };

// Where Stripe sends the client back. It never confirms anything itself: it shows the status from
// the database and waits for the webhook (the client may also close the tab — the webhook still
// confirms the booking).
export default function BookingPaymentPage({
  params,
  searchParams,
}: PageProps<"/account/bookings/[id]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href="/account"
        className="inline-flex min-h-6 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        My bookings
      </Link>
      <Suspense fallback={<PaymentSkeleton />}>
        <PaymentContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PaymentContent({
  params,
  searchParams,
}: Pick<PageProps<"/account/bookings/[id]">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/account/bookings/${id}`);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("bookings")
    .select("*, providers(slug)")
    .eq("id", id)
    .eq("client_id", user.id)
    .maybeSingle();
  if (!row) notFound();

  const booking = toBooking(row);
  const tz = (await viewerTimeZone()) ?? booking.providerTimezone;
  const start = new Date(booking.startsAt);

  return (
    <>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{booking.serviceTitle}</h1>
      <dl className="mt-6 grid gap-4 rounded-2xl border bg-card p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">With</dt>
          <dd className="font-medium">
            {/* Only public profiles: the join is empty for a suspended or removed provider. */}
            {row.providers ? (
              <Link
                href={`/pros/${row.providers.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {booking.providerName}
              </Link>
            ) : (
              booking.providerName
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">When</dt>
          <dd className="font-medium">
            <time dateTime={booking.startsAt}>{formatDateTime(start, tz)}</time> ({zoneLabel(tz)})
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="font-medium">{formatDuration(booking.durationMin)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Price</dt>
          <dd className="font-medium">
            {booking.priceCents === 0 ? "Free" : formatPrice(booking.priceCents, booking.currency)}
          </dd>
        </div>
      </dl>
      <div className="mt-8">
        <PaymentStatus
          bookingId={booking.id}
          initial={{
            status: booking.status,
            expiresAt: booking.expiresAt,
            paidCents: booking.paidCents,
            refundedCents: booking.refundedCents,
          }}
          currency={booking.currency}
          returnedFromStripe={query.paid === "1"}
          bookAgainHref={row.providers ? `/pros/${row.providers.slug}/book` : "/pros"}
          timeZone={tz}
        />
      </div>
    </>
  );
}

function PaymentSkeleton() {
  return (
    <div aria-busy="true" className="mt-6">
      <span className="sr-only" role="status">
        Loading the booking…
      </span>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-6 h-32 w-full" />
      <Skeleton className="mt-8 h-24 w-full" />
    </div>
  );
}
