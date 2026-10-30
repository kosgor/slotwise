"use client";

import { CircleCheckIcon, Loader2Icon, TimerIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { CancelBookingDialog } from "@/components/features/booking/cancel-booking-dialog";
import { FormMessage } from "@/components/forms/form-message";
import { useResultToast } from "@/components/forms/toasts";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { extendHold, resumePayment, type BookingActionState } from "@/lib/booking/actions";
import type { BookingStatus } from "@/lib/booking/types";
import { formatPrice } from "@/lib/catalog/format";
import { formatTime } from "@/lib/datetime";

type Snapshot = {
  status: BookingStatus;
  expiresAt: string | null;
  paidCents: number;
  refundedCents: number;
};

const POLL_MS = 2000;
/** After this long without a webhook, say so instead of spinning forever. */
const SLOW_WEBHOOK_MS = 30_000;
/** Moments worth announcing to screen readers; not every second. */
const ANNOUNCE_AT_MINUTES = [1, 5];
const STATUS_ANNOUNCEMENTS: Record<BookingStatus, string> = {
  confirmed: "Payment received. Your booking is confirmed.",
  expired: "The time to pay has run out.",
  cancelled: "The booking was cancelled.",
  completed: "",
  pending_payment: "",
};

function countdownAnnouncement(minutesLeft: number): string {
  const mark = ANNOUNCE_AT_MINUTES.find((m) => minutesLeft <= m);
  return mark ? `Less than ${mark === 1 ? "a minute" : `${mark} minutes`} left to pay.` : "";
}

/**
 * Payment state of one booking, kept fresh by polling /api/bookings/:id while it is unpaid.
 * Accessibility:
 * * one polite live region announces changes of state ("Payment received…") and only two moments
 *   of the countdown (5 and 1 minute left), not every tick;
 * * the ticking clock is aria-hidden; screen readers get "about N minutes left" when they read it;
 * * the time limit can be extended ("I need more time") or the hold released (WCAG 2.2.1).
 */
export function PaymentStatus({
  bookingId,
  initial,
  currency,
  returnedFromStripe,
  bookAgainHref,
  timeZone,
}: {
  bookingId: string;
  initial: Snapshot;
  currency: string;
  /** The client came back from Stripe's success URL: the webhook is probably on its way. */
  returnedFromStripe: boolean;
  bookAgainHref: string;
  timeZone: string;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());
  const [initialStatus] = useState(initial.status);

  const [resumeState, resume, resuming] = useActionState<BookingActionState, FormData>(
    resumePayment,
    { status: "idle" },
  );
  const [extendState, extend, extending] = useActionState<BookingActionState, FormData>(
    extendHold,
    { status: "idle" },
  );
  useResultToast(extendState);

  const expiresAt = snapshot.expiresAt ? Date.parse(snapshot.expiresAt) : null;
  const holdOver = snapshot.status === "pending_payment" && expiresAt !== null && expiresAt <= now;
  const status: BookingStatus = holdOver ? "expired" : snapshot.status;
  const waiting = snapshot.status === "pending_payment";

  // Poll while unpaid. A fetch error just waits for the next round.
  useEffect(() => {
    if (!waiting) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, { cache: "no-store" });
        if (res.ok && active) setSnapshot((await res.json()) as Snapshot);
      } catch {
        // offline for a moment
      }
    };
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [waiting, bookingId]);

  const minutesLeft =
    expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 60_000));
  // The live region text is derived, so it changes (and is announced) only when the state changes
  // or the countdown crosses one of the marks — not on every tick.
  const announcement =
    status !== initialStatus
      ? STATUS_ANNOUNCEMENTS[status]
      : status === "pending_payment" && !returnedFromStripe && minutesLeft !== null
        ? countdownAnnouncement(minutesLeft)
        : "";

  const owedBack = snapshot.paidCents - snapshot.refundedCents;

  return (
    <section aria-labelledby="payment-heading" className="rounded-2xl border bg-card p-6">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {status === "confirmed" && (
        <>
          <h2 id="payment-heading" className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheckIcon className="size-5 text-success" aria-hidden="true" />
            Payment received — you are booked
          </h2>
          <p className="mt-2 text-muted-foreground">
            We have emailed you a confirmation. Free cancellation with a full refund is possible
            until 24 hours before the session.
          </p>
          <Button asChild className="mt-4">
            <Link href="/account">Go to my bookings</Link>
          </Button>
        </>
      )}

      {status === "pending_payment" && returnedFromStripe && (
        <>
          <h2 id="payment-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Loader2Icon
              className="size-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Waiting for payment confirmation…
          </h2>
          <p className="mt-2 text-muted-foreground">
            Stripe is confirming your payment. This usually takes a few seconds; you can leave this
            page — the booking is confirmed either way and we will email you.
          </p>
          {now - startedAt > SLOW_WEBHOOK_MS && (
            <p className="mt-2 text-sm text-muted-foreground">
              This is taking longer than usual. If the money has left your account, the booking will
              be confirmed or refunded automatically.
            </p>
          )}
        </>
      )}

      {status === "pending_payment" && !returnedFromStripe && expiresAt !== null && (
        <>
          <h2 id="payment-heading" className="text-lg font-semibold">
            Complete your payment
          </h2>
          <p className="mt-2 flex items-center gap-2 text-muted-foreground">
            <TimerIcon className="size-4" aria-hidden="true" />
            <span aria-hidden="true" className="font-medium text-foreground tabular-nums">
              {countdown(expiresAt - now)}
            </span>
            <span aria-hidden="true">
              left — held until {formatTime(new Date(expiresAt), timeZone)}
            </span>
            <span className="sr-only">
              About {minutesLeft} {minutesLeft === 1 ? "minute" : "minutes"} left to pay. The time
              is held until {formatTime(new Date(expiresAt), timeZone)}.
            </span>
          </p>
          <div className="mt-4 space-y-3">
            <FormMessage status={resumeState.status} message={resumeState.message} />
            <FormMessage
              status={extendState.status === "error" ? "error" : "idle"}
              message={extendState.message}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={resume}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <SubmitButton pending={resuming} pendingLabel="Opening payment…">
                Continue to payment
              </SubmitButton>
            </form>
            <form action={extend}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <SubmitButton pending={extending} pendingLabel="Extending…" variant="outline">
                I need more time
              </SubmitButton>
            </form>
            <CancelBookingDialog
              bookingId={bookingId}
              summary="this unpaid booking"
              policy="The time becomes available to others again. You have not been charged."
              returnTo="/account"
              triggerLabel="Release this time"
            />
          </div>
        </>
      )}

      {status === "expired" && (
        <>
          <h2 id="payment-heading" className="text-lg font-semibold">
            The time to pay has run out
          </h2>
          <p className="mt-2 text-muted-foreground">
            {owedBack > 0
              ? `Your payment arrived after the hold ended. ${formatPrice(owedBack, currency)} is being refunded in full.`
              : "You have not been charged. The time may still be free — pick it again."}
          </p>
          <Button asChild className="mt-4">
            <Link href={bookAgainHref}>Choose a time</Link>
          </Button>
        </>
      )}

      {(status === "cancelled" || status === "completed") && (
        <>
          <h2 id="payment-heading" className="text-lg font-semibold">
            {status === "cancelled" ? "This booking was cancelled" : "This session has taken place"}
          </h2>
          {snapshot.paidCents > 0 && (
            <p className="mt-2 text-muted-foreground">
              {owedBack > 0
                ? `A refund of ${formatPrice(owedBack, currency)} is in progress.`
                : snapshot.refundedCents > 0
                  ? `Refunded ${formatPrice(snapshot.refundedCents, currency)}.`
                  : null}
            </p>
          )}
          <Button asChild variant="outline" className="mt-4">
            <Link href="/account">Go to my bookings</Link>
          </Button>
        </>
      )}
    </section>
  );
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
