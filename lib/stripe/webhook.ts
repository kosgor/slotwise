// What each Stripe event does. Kept apart from the HTTP route (app/api/webhooks/stripe/route.ts)
// so tests can run it against the real SQL functions with a fake Stripe.
//
// Rules (docs/decisions/0009-payments-and-webhooks.md):
// * every database change is one webhook function: it records the event id and changes data in
//   the same transaction, so a repeated event changes nothing ('duplicate');
// * the event is only a notification: the object it names (session, charge, invoice,
//   subscription) is re-read from the Stripe API. So neither the order of events nor the API version
//   the event was rendered in matters (an account set to an old API version sends old-shaped events;
//   the SDK always reads in its own version);
// * slow work (emails, refunds) goes to background jobs. Job events reuse the Stripe event id, so
//   a retried webhook cannot start the same job twice (Inngest drops duplicate ids);
// * objects tagged for another database (another environment on the same Stripe account) are
//   skipped with 'foreign' — see lib/stripe/db-tag.ts.

import type Stripe from "stripe";

import { bookingConfirmed, bookingRefunded, bookingRefundNeeded } from "@/inngest/events";
import { planForSubscription } from "@/lib/billing/plans";

import { isForeign } from "./db-tag";

type JobEvent =
  | ReturnType<typeof bookingConfirmed.create>
  | ReturnType<typeof bookingRefunded.create>
  | ReturnType<typeof bookingRefundNeeded.create>;

export type SubscriptionSync = {
  eventId: string;
  eventType: string;
  providerId: string;
  customerId: string;
  subscriptionId: string;
  plan: "free" | "pro";
  status: string;
  priceLookupKey: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/** The database side. Production: the webhook SQL functions via the service-role client. */
export type WebhookDb = {
  checkoutCompleted(args: {
    eventId: string;
    eventType: string;
    bookingId: string;
    sessionId: string;
    paymentIntentId: string;
    amountCents: number;
    currency: string;
  }): Promise<string>;
  checkoutExpired(args: { eventId: string; eventType: string; bookingId: string }): Promise<string>;
  /** Booking id, or null when the event was processed before. */
  chargeRefunded(args: {
    eventId: string;
    eventType: string;
    paymentIntentId: string;
    refundedCents: number;
  }): Promise<string | null>;
  syncSubscription(args: SubscriptionSync): Promise<string>;
  /** Result stored for an event processed before (to redo its follow-up jobs on a retry). */
  eventResult(eventId: string): Promise<string | null>;
  bookingIdForPayment(paymentIntentId: string): Promise<string | null>;
};

/** Current state from the Stripe API. Production: the SDK (lib/stripe/webhook-deps.ts). */
export type StripeReader = {
  checkoutSession(id: string): Promise<Stripe.Checkout.Session>;
  charge(id: string): Promise<Stripe.Charge>;
  invoice(id: string): Promise<Stripe.Invoice>;
  subscription(id: string): Promise<Stripe.Subscription>;
};

export type WebhookDeps = {
  db: WebhookDb;
  stripe: StripeReader;
  /** Must throw on failure: the route then answers 500 and Stripe retries. */
  sendJobs(events: JobEvent[]): Promise<void>;
  /** This database's tag (lib/stripe/db-tag.ts). */
  dbTag: string;
};

export type WebhookOutcome = { result: string; jobs: JobEvent[] };

const FOREIGN: WebhookOutcome = { result: "foreign", jobs: [] };

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const outcome = await apply(event, deps);
  if (outcome.jobs.length > 0) await deps.sendJobs(outcome.jobs);
  return outcome;
}

/** Id of the object the event is about — the only field read from the event body. */
const objectId = (event: Stripe.Event) => (event.data.object as { id: string }).id;

async function apply(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  const { db, stripe } = deps;
  const base = { eventId: event.id, eventType: event.type };
  const jobId = (suffix: string) => ({ id: `${event.id}:${suffix}` });

  switch (event.type) {
    // Card payments complete at once. Delayed methods (bank debits) complete later with
    // async_payment_succeeded; until then payment_status is "unpaid" and the hold stays.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = await stripe.checkoutSession(objectId(event));
      if (isForeign(session.metadata, deps.dbTag)) return FOREIGN;
      if (session.mode === "subscription") return syncFromSession(event, session, deps);

      const bookingId = session.metadata?.booking_id;
      const paymentIntentId = idOf(session.payment_intent);
      if (!bookingId || !paymentIntentId) return { result: "ignored", jobs: [] };
      if (session.payment_status !== "paid") return { result: "awaiting_payment", jobs: [] };

      const result = await db.checkoutCompleted({
        ...base,
        bookingId,
        sessionId: session.id,
        paymentIntentId,
        // With Adaptive Pricing the totals are in the customer's currency; compare the price in
        // the currency it was created in. (Checkout turns it off; this keeps the check honest.)
        amountCents: session.currency_conversion?.amount_total ?? session.amount_total ?? 0,
        currency: session.currency_conversion?.source_currency ?? session.currency ?? "gbp",
      });
      // A retry of an event we already applied: repeat its jobs (same ids → no duplicates).
      const effective = result === "duplicate" ? await db.eventResult(event.id) : result;
      const jobs: JobEvent[] = [];
      if (effective === "confirmed")
        jobs.push(bookingConfirmed.create({ bookingId }, jobId("confirmed")));
      if (effective === "refund_needed")
        jobs.push(bookingRefundNeeded.create({ bookingId }, jobId("refund")));
      return { result, jobs };
    }

    case "checkout.session.expired": {
      const session = await stripe.checkoutSession(objectId(event));
      if (isForeign(session.metadata, deps.dbTag)) return FOREIGN;
      const bookingId = session.metadata?.booking_id;
      // Trust the current state, not the event: an "expired" event for a session that is still
      // open (forged, or simply stale) changes nothing.
      if (session.mode !== "payment" || !bookingId || session.status !== "expired")
        return { result: "ignored", jobs: [] };
      return { result: await db.checkoutExpired({ ...base, bookingId }), jobs: [] };
    }

    case "charge.refunded": {
      const charge = await stripe.charge(objectId(event));
      // The charge carries the metadata of its payment (payment_intent_data in Checkout).
      if (isForeign(charge.metadata, deps.dbTag)) return FOREIGN;
      const paymentIntentId = idOf(charge.payment_intent);
      if (!paymentIntentId) return { result: "ignored", jobs: [] };
      const recorded = await db.chargeRefunded({
        ...base,
        paymentIntentId,
        refundedCents: charge.amount_refunded,
      });
      const bookingId = recorded ?? (await db.bookingIdForPayment(paymentIntentId));
      const jobs = bookingId
        ? [
            bookingRefunded.create(
              { bookingId, refundedCents: charge.amount_refunded },
              jobId("refunded"),
            ),
          ]
        : [];
      return { result: recorded ? "refunded" : "duplicate", jobs };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return syncSubscription(event, objectId(event), deps);

    case "invoice.payment_failed":
    case "invoice.paid": {
      const invoice = await stripe.invoice(objectId(event));
      const subscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = idOf(subscription);
      if (!subscriptionId) return { result: "ignored", jobs: [] };
      return syncSubscription(event, subscriptionId, deps);
    }

    default:
      return { result: "ignored", jobs: [] };
  }
}

function syncFromSession(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) return Promise.resolve({ result: "ignored", jobs: [] });
  return syncSubscription(event, subscriptionId, deps);
}

/** Stores the subscription state Stripe reports now, whatever the event said. */
async function syncSubscription(
  event: Stripe.Event,
  subscriptionId: string,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const sub = await deps.stripe.subscription(subscriptionId);
  if (isForeign(sub.metadata, deps.dbTag)) return FOREIGN;
  const providerId = sub.metadata?.provider_id;
  const customerId = idOf(sub.customer);
  if (!providerId || !customerId) return { result: "ignored", jobs: [] };

  const item = sub.items.data[0];
  const lookupKey = item?.price.lookup_key ?? null;
  const result = await deps.db.syncSubscription({
    eventId: event.id,
    eventType: event.type,
    providerId,
    customerId,
    subscriptionId: sub.id,
    plan: planForSubscription(sub.status, lookupKey),
    status: sub.status,
    priceLookupKey: lookupKey,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
  return { result, jobs: [] };
}
