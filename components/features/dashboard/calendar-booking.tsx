"use client";

import { CalendarIcon, ClockIcon, CreditCardIcon, MailIcon, UserIcon } from "lucide-react";
import { useState } from "react";

import { CancelBookingDialog } from "@/components/features/booking/cancel-booking-dialog";
import { RescheduleDialog } from "@/components/features/booking/reschedule-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { pendingRefundCents } from "@/lib/booking/status";
import type { Booking } from "@/lib/booking/types";
import { formatDuration, formatPrice } from "@/lib/catalog/format";
import { formatDateTime, formatDayLong, formatTime, zoneLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/**
 * One booking in the provider's week calendar: the entry opens its details with the same actions
 * as the list (move, cancel, email the client). The reschedule and cancel dialogs open on top of
 * this one; a successful move closes both.
 */
export function CalendarBooking({
  booking,
  timeZone,
  upcoming,
}: {
  booking: Booking;
  timeZone: string;
  /** Confirmed and not started yet: computed on the server, where "now" is known. */
  upcoming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const start = new Date(booking.startsAt);
  const cancelled = booking.status === "cancelled";
  const summary = `${booking.serviceTitle}, ${formatDayLong(start, timeZone)}, ${formatTime(start, timeZone)}`;
  const refundPending = pendingRefundCents(booking);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "block w-full rounded-md border-l-2 border-primary bg-background px-2 py-1 text-left text-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
            cancelled && "border-muted-foreground line-through opacity-70",
          )}
        >
          <span className="font-medium">{formatTime(start, timeZone)}</span> {booking.serviceTitle}
          <span className="block text-muted-foreground">{booking.clientName}</span>
          <span className="sr-only">{cancelled ? " (cancelled)" : ""}. Show details</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle>{booking.serviceTitle}</DialogTitle>
            {cancelled ? (
              <Badge className="bg-muted text-muted-foreground">Cancelled</Badge>
            ) : booking.rescheduledAt ? (
              <Badge variant="outline">Rescheduled</Badge>
            ) : null}
          </div>
          <DialogDescription className="sr-only">Booking details and actions.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <CalendarIcon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>
              <time dateTime={booking.startsAt}>{formatDateTime(start, timeZone)}</time>{" "}
              <span className="text-muted-foreground">({zoneLabel(timeZone)})</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <ClockIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {formatDuration(booking.durationMin)} ·{" "}
            {booking.priceCents === 0 ? "Free" : formatPrice(booking.priceCents, booking.currency)}
          </li>
          <li className="flex items-start gap-2">
            <UserIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">
              {booking.clientName}
              <span className="block break-all text-muted-foreground">{booking.clientEmail}</span>
            </span>
          </li>
          {(booking.paidCents > 0 || booking.refundedCents > 0) && (
            <li className="flex items-center gap-2">
              <CreditCardIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {refundPending > 0
                ? `Refund of ${formatPrice(refundPending, booking.currency)} in progress`
                : booking.refundedCents > 0
                  ? `Refunded ${formatPrice(booking.refundedCents, booking.currency)}`
                  : `Paid ${formatPrice(booking.paidCents, booking.currency)}`}
            </li>
          )}
        </ul>
        <DialogFooter className="sm:justify-between">
          <Button asChild variant="ghost" size="sm">
            <a href={`mailto:${booking.clientEmail}`}>
              <MailIcon aria-hidden="true" />
              Email client
            </a>
          </Button>
          {upcoming && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
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
              <RescheduleDialog
                bookingId={booking.id}
                summary={summary}
                startsAt={booking.startsAt}
                durationMin={booking.durationMin}
                timeZone={timeZone}
                onDone={() => setOpen(false)}
              />
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
