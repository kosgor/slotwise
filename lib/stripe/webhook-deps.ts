// Production wiring for handleStripeEvent: webhook SQL functions through the service-role client,
// the live Stripe API and Inngest.

import "server-only";

import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

import { currentDbTag } from "./db-tag";
import { stripe } from "./server";
import type { WebhookDeps } from "./webhook";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function webhookDeps(): WebhookDeps {
  const admin = createAdminClient();
  return {
    db: {
      checkoutCompleted: async (a) =>
        unwrap(
          await admin.rpc("stripe_checkout_completed", {
            p_event_id: a.eventId,
            p_event_type: a.eventType,
            p_booking_id: a.bookingId,
            p_session_id: a.sessionId,
            p_payment_intent_id: a.paymentIntentId,
            p_amount_cents: a.amountCents,
            p_currency: a.currency,
          }),
        ),
      checkoutExpired: async (a) =>
        unwrap(
          await admin.rpc("stripe_checkout_expired", {
            p_event_id: a.eventId,
            p_event_type: a.eventType,
            p_booking_id: a.bookingId,
          }),
        ),
      chargeRefunded: async (a) =>
        unwrap(
          await admin.rpc("stripe_charge_refunded", {
            p_event_id: a.eventId,
            p_event_type: a.eventType,
            p_payment_intent_id: a.paymentIntentId,
            p_refunded_cents: a.refundedCents,
          }),
        ),
      syncSubscription: async (a) =>
        unwrap(
          await admin.rpc("stripe_sync_subscription", {
            p_event_id: a.eventId,
            p_event_type: a.eventType,
            p_provider_id: a.providerId,
            p_customer_id: a.customerId,
            p_subscription_id: a.subscriptionId,
            p_plan: a.plan,
            p_status: a.status,
            // Both may be null; generated types never mark function arguments as nullable.
            p_price_lookup_key: a.priceLookupKey as string,
            p_current_period_end: a.currentPeriodEnd as string,
            p_cancel_at_period_end: a.cancelAtPeriodEnd,
          }),
        ),
      eventResult: async (eventId) => {
        const { data, error } = await admin
          .from("stripe_events")
          .select("result")
          .eq("id", eventId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data?.result ?? null;
      },
      bookingIdForPayment: async (paymentIntentId) => {
        const { data, error } = await admin
          .from("payments")
          .select("booking_id")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data?.booking_id ?? null;
      },
    },
    stripe: {
      checkoutSession: (id) => stripe().checkout.sessions.retrieve(id),
      charge: (id) => stripe().charges.retrieve(id),
      invoice: (id) => stripe().invoices.retrieve(id),
      subscription: (id) => stripe().subscriptions.retrieve(id),
    },
    sendJobs: async (events) => {
      await inngest.send(events);
    },
    dbTag: currentDbTag(),
  };
}
