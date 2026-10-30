// Stripe Checkout for a booking hold. The amount comes from the booking row, which book_slot()
// filled from the services table — never from the browser.

import "server-only";

import { formatDateTime, zoneLabel } from "@/lib/datetime";
import { dbTagMetadata } from "@/lib/stripe/db-tag";
import { siteUrl, stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { CHECKOUT_SESSION_MINUTES } from "./rules";
import type { BookingRow } from "./server-data";

/** Creates the Checkout page for a pending booking and returns its URL. */
export async function createBookingCheckout(booking: BookingRow): Promise<string> {
  const start = new Date(booking.starts_at);
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: booking.id,
      customer_email: booking.client_email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency.toLowerCase(),
            unit_amount: booking.price_cents,
            product_data: {
              name: `${booking.service_title} with ${booking.provider_name}`,
              description: `${formatDateTime(start, booking.provider_timezone)} (${zoneLabel(booking.provider_timezone)})`,
            },
          },
        },
      ],
      // Charge in the provider's currency. Adaptive Pricing would let Stripe show and charge e.g.
      // EUR, and then amounts and refunds would no longer be in the currency of our prices.
      adaptive_pricing: { enabled: false },
      // The webhook finds the booking by this id (on the session and on the payment), in the
      // database the tag names.
      metadata: { booking_id: booking.id, ...dbTagMetadata() },
      payment_intent_data: { metadata: { booking_id: booking.id, ...dbTagMetadata() } },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_MINUTES * 60,
      // The success page only shows the status; the booking is confirmed by the webhook.
      success_url: siteUrl(`/account/bookings/${booking.id}?paid=1`),
      cancel_url: siteUrl(`/account/bookings/${booking.id}`),
    },
    // A network retry of this call returns the same session instead of creating a second one.
    { idempotencyKey: `checkout:${booking.id}` },
  );
  if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");

  // Users cannot write bookings; the server records which session belongs to the hold.
  const { error } = await createAdminClient()
    .from("bookings")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", booking.id);
  if (error) throw new Error(`Saving the Checkout session: ${error.message}`);
  return session.url;
}

/** URL of the booking's Checkout page while it can still be paid, otherwise null. */
export async function openCheckoutUrl(sessionId: string): Promise<string | null> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  return session.status === "open" ? session.url : null;
}

/** Closes the Checkout page of a released hold so it cannot be paid any more. Best effort. */
export async function closeCheckout(sessionId: string | null): Promise<void> {
  if (!sessionId) return;
  await stripe()
    .checkout.sessions.expire(sessionId)
    .catch(() => undefined);
}
