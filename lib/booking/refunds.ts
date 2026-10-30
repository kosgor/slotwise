// Refunds through the Stripe Refund API. The database learns about the result from the
// charge.refunded webhook, not from this call: one source of truth for "how much was refunded".

import "server-only";

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe/server";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Refunds whatever is still unrefunded on a booking's payments. Safe to call repeatedly: the
 * idempotency key includes the amount already refunded, so retries of the same attempt return the
 * same Stripe refund instead of creating a second one. Returns the amount requested, in cents.
 */
export async function refundBooking(admin: AdminClient, bookingId: string): Promise<number> {
  const { data: payments, error } = await admin
    .from("payments")
    .select("id, stripe_payment_intent_id, amount_cents, refunded_cents")
    .eq("booking_id", bookingId);
  if (error) throw new Error(`Payments for ${bookingId}: ${error.message}`);

  let requested = 0;
  for (const p of payments) {
    const amount = p.amount_cents - p.refunded_cents;
    if (amount <= 0) continue;
    try {
      await stripe().refunds.create(
        {
          payment_intent: p.stripe_payment_intent_id,
          amount,
          reason: "requested_by_customer",
          metadata: { booking_id: bookingId },
        },
        { idempotencyKey: `refund:${p.id}:${p.refunded_cents}` },
      );
      requested += amount;
    } catch (e) {
      // Refunded already (e.g. from the Stripe Dashboard) and the webhook is on its way: done.
      if ((e as Stripe.errors.StripeError).code === "charge_already_refunded") continue;
      throw e;
    }
  }
  return requested;
}

/** Cancelled or expired bookings that still hold the client's money. */
export async function bookingsOwedRefund(admin: AdminClient): Promise<string[]> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, paid_cents, refunded_cents")
    .in("status", ["cancelled", "expired"])
    .gt("paid_cents", 0)
    .limit(200);
  if (error) throw new Error(`Refund check: ${error.message}`);
  return data.filter((b) => b.paid_cents > b.refunded_cents).map((b) => b.id);
}
