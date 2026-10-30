// Pure helpers about booking status, safe for Server and Client Components.

import type { Booking } from "./types";

/** Status as the user should see it: a hold whose 15 minutes are over is expired, even before the
 *  expiry job (every 5 minutes) has marked it in the database. */
export function displayStatus(booking: Booking, now: Date): Booking["status"] {
  if (
    booking.status === "pending_payment" &&
    booking.expiresAt &&
    new Date(booking.expiresAt) <= now
  )
    return "expired";
  return booking.status;
}

/** Money still owed back to the client (a refund requested but not yet confirmed by Stripe). */
export function pendingRefundCents(
  booking: Pick<Booking, "paidCents" | "refundedCents" | "status">,
) {
  return booking.status === "cancelled" || booking.status === "expired"
    ? Math.max(0, booking.paidCents - booking.refundedCents)
    : 0;
}
