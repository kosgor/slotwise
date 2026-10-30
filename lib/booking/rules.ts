// Booking rules. The database enforces the same numbers inside book_slot(), cancel_booking() and
// extend_payment_hold() (supabase/migrations/20261019000000_accounts_and_booking.sql,
// 20261020000000_payments.sql); tests/rls checks they agree. Change one — change both.

/** Slots start on a 30-minute grid counted from the start of the working-hours rule. */
export const SLOT_STEP_MINUTES = 30;
/** Earliest bookable start: one hour from now. */
export const MIN_NOTICE_MINUTES = 60;
/** Latest bookable start: 60 days ahead. */
export const MAX_ADVANCE_DAYS = 60;
/** Clients cancel for free until 24 hours before the start. */
export const CLIENT_CANCELLATION_HOURS = 24;
/** A paid booking holds the slot this long while the client pays. */
export const PAYMENT_HOLD_MINUTES = 15;
/** Extending a hold never goes past this many minutes after booking… */
export const PAYMENT_HOLD_MAX_MINUTES = 25;
/** …because the Stripe Checkout page itself closes after ~30 (Stripe's minimum is 30 minutes;
 *  one more absorbs clock drift between us and Stripe). The expiry job closes it earlier. */
export const CHECKOUT_SESSION_MINUTES = 31;
/** Unpaid holds one client may have at a time. */
export const MAX_ACTIVE_HOLDS = 3;

const HOUR = 60 * 60 * 1000;

export function clientCancellationDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - CLIENT_CANCELLATION_HOURS * HOUR);
}

/** Mirrors cancel_booking(): a client may cancel while the start is at least 24 hours away. */
export function canClientCancel(startsAt: Date, now: Date): boolean {
  return now.getTime() <= clientCancellationDeadline(startsAt).getTime();
}
