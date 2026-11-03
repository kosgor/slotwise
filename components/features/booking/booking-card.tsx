import { CalendarIcon, ClockIcon, CreditCardIcon, UserIcon } from "lucide-react";
import Link from "next/link";

import { CancelBookingDialog } from "@/components/features/booking/cancel-booking-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canClientCancel, clientCancellationDeadline } from "@/lib/booking/rules";
import { displayStatus, pendingRefundCents } from "@/lib/booking/status";
import type { Booking } from "@/lib/booking/types";
import { formatDuration, formatPrice } from "@/lib/catalog/format";
import { formatDateTime, formatDayLong, formatTime, zoneLabel } from "@/lib/datetime";

const STATUS_LABEL: Record<Booking["status"], string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  expired: "Expired",
};

const STATUS_CLASS: Record<Booking["status"], string> = {
  pending_payment: "bg-warning text-warning-foreground",
  confirmed: "bg-success text-success-foreground",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-secondary text-secondary-foreground",
  expired: "bg-muted text-muted-foreground",
};

/**
 * One booking. `audience` decides whose name is shown and which cancellation rule applies:
 * clients cancel for free until 24 h before; providers can cancel any upcoming booking.
 * The database enforces the same rule — the UI only explains it.
 */
export function BookingCard({
  booking,
  audience,
  timeZone,
  now,
  providerHref,
}: {
  booking: Booking;
  audience: "client" | "provider";
  /** The provider's public profile; absent when it is no longer public (suspended, removed). */
  providerHref?: string;
  /** Zone to show times in; falls back to the provider's zone. */
  timeZone: string | null;
  now: Date;
}) {
  const tz = timeZone ?? booking.providerTimezone;
  const start = new Date(booking.startsAt);
  const status = displayStatus(booking, now);
  const upcoming = status === "confirmed" && start >= now;
  const awaitingPayment = status === "pending_payment";
  const refundPending = pendingRefundCents(booking);
  const summary = `${booking.serviceTitle}, ${formatDayLong(start, tz)}, ${formatTime(start, tz)}`;
  const clientCanCancel = canClientCancel(start, now);

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{booking.serviceTitle}</h3>
          {/* Status as text, not only colour. */}
          <Badge className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CalendarIcon className="size-4" aria-hidden="true" />
            <time dateTime={booking.startsAt}>{formatDateTime(start, tz)}</time>
            <span>({zoneLabel(tz)})</span>
          </li>
          <li className="flex items-center gap-2">
            <ClockIcon className="size-4" aria-hidden="true" />
            {formatDuration(booking.durationMin)} ·{" "}
            {booking.priceCents === 0 ? "Free" : formatPrice(booking.priceCents, booking.currency)}
          </li>
          <li className="flex items-center gap-2">
            <UserIcon className="size-4" aria-hidden="true" />
            {audience === "client" ? (
              <>
                with{" "}
                {providerHref ? (
                  <Link
                    href={providerHref}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {booking.providerName}
                  </Link>
                ) : (
                  booking.providerName
                )}
              </>
            ) : (
              <>
                {booking.clientName} ·{" "}
                <a
                  href={`mailto:${booking.clientEmail}`}
                  className="underline-offset-4 hover:underline"
                >
                  {booking.clientEmail}
                </a>
              </>
            )}
          </li>
          {(booking.refundedCents > 0 || refundPending > 0) && (
            <li className="flex items-center gap-2">
              <CreditCardIcon className="size-4" aria-hidden="true" />
              {refundPending > 0
                ? `Refund of ${formatPrice(refundPending, booking.currency)} in progress`
                : `Refunded ${formatPrice(booking.refundedCents, booking.currency)}`}
            </li>
          )}
        </ul>
      </div>

      {awaitingPayment && audience === "client" && (
        <div className="shrink-0 sm:text-right">
          <Button asChild size="sm">
            <Link href={`/account/bookings/${booking.id}`}>
              Complete payment<span className="sr-only">: {summary}</span>
            </Link>
          </Button>
          {booking.expiresAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Held until {formatTime(new Date(booking.expiresAt), tz)}
            </p>
          )}
        </div>
      )}

      {upcoming && (
        <div className="shrink-0 sm:text-right">
          {audience === "provider" ? (
            <CancelBookingDialog
              bookingId={booking.id}
              summary={summary}
              policy={
                booking.paidCents > 0
                  ? "The client gets a full refund and an email."
                  : "The client will see the booking as cancelled."
              }
              returnTo="/dashboard/bookings"
            />
          ) : clientCanCancel ? (
            <CancelBookingDialog
              bookingId={booking.id}
              summary={summary}
              policy={
                booking.paidCents > 0
                  ? `You will get a full refund of ${formatPrice(booking.paidCents - booking.refundedCents, booking.currency)}.`
                  : "Cancellation is free until 24 hours before the session."
              }
              returnTo="/account"
            />
          ) : (
            <p className="max-w-56 text-sm text-muted-foreground">
              Free cancellation ended {formatDateTime(clientCancellationDeadline(start), tz)}.
              Please contact {booking.providerName}.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
