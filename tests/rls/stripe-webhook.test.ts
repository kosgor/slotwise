// @vitest-environment node
//
// The Stripe webhook handler (lib/stripe/webhook.ts) on top of the real SQL functions (PGlite):
// the same event three times, events in the wrong order, follow-up jobs on retries. Stripe itself
// is a small in-memory fake; the signature check is tested on the route (stripe-webhook-route).

import type { PGlite } from "@electric-sql/pglite";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAvailableSlots, localDayRange, nextLocalDates } from "@/lib/booking/slots";
import {
  availabilityExceptions,
  availabilityRules,
  providers,
  services,
} from "@/lib/catalog/seed-data";
import { handleStripeEvent, type WebhookDeps } from "@/lib/stripe/webhook";

import { asService, asUser, createTestDb, createUser, rolledBack as rolledBackIn } from "./db";

const CLIENT = "00000000-0000-4000-8000-0000000000a1";
const anna = providers.find((p) => p.slug === "anna-yoga")!;
const annaClass = services.find((s) => s.providerId === anna.id && s.durationMin === 60)!;

let db: PGlite;
const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);

const firstSlot = (() => {
  const day = nextLocalDates(anna.timezone, new Date(), 30)
    .slice(1)
    .map((d) =>
      getAvailableSlots({
        rules: availabilityRules.filter((r) => r.providerId === anna.id),
        exceptions: availabilityExceptions.filter((e) => e.providerId === anna.id),
        busy: [],
        durationMin: annaClass.durationMin,
        timeZone: anna.timezone,
        ...localDayRange(d, anna.timezone),
        now: new Date(),
      }),
    )
    .find((slots) => slots.length > 0)!;
  return day[0]!;
})();

/** In-memory "Stripe": subscriptions by id, as the API would return them right now. */
const stripeSubscriptions = new Map<string, Stripe.Subscription>();

function subscription(status: Stripe.Subscription.Status, providerId = anna.id) {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status,
    cancel_at_period_end: false,
    metadata: { provider_id: providerId },
    items: {
      data: [
        {
          price: { lookup_key: "slotwise_pro_monthly" },
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

const sent: { name: string; id?: string }[] = [];
let failNextSend = false;

const one = async <T>(sql: string, params: unknown[]) => (await asService<T>(db, sql, params))[0]!;

const deps: WebhookDeps = {
  db: {
    checkoutCompleted: async (a) =>
      (
        await one<{ r: string }>(
          "select public.stripe_checkout_completed($1, $2, $3, $4, $5, $6, $7) as r",
          [
            a.eventId,
            a.eventType,
            a.bookingId,
            a.sessionId,
            a.paymentIntentId,
            a.amountCents,
            a.currency,
          ],
        )
      ).r,
    checkoutExpired: async (a) =>
      (
        await one<{ r: string }>("select public.stripe_checkout_expired($1, $2, $3) as r", [
          a.eventId,
          a.eventType,
          a.bookingId,
        ])
      ).r,
    chargeRefunded: async (a) =>
      (
        await one<{ r: string | null }>(
          "select public.stripe_charge_refunded($1, $2, $3, $4) as r",
          [a.eventId, a.eventType, a.paymentIntentId, a.refundedCents],
        )
      ).r,
    syncSubscription: async (a) =>
      (
        await one<{ r: string }>(
          "select public.stripe_sync_subscription($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as r",
          [
            a.eventId,
            a.eventType,
            a.providerId,
            a.customerId,
            a.subscriptionId,
            a.plan,
            a.status,
            a.priceLookupKey,
            a.currentPeriodEnd,
            a.cancelAtPeriodEnd,
          ],
        )
      ).r,
    eventResult: async (id) =>
      (
        await asService<{ result: string }>(
          db,
          "select result from public.stripe_events where id = $1",
          [id],
        )
      )[0]?.result ?? null,
    bookingIdForPayment: async (pi) =>
      (
        await asService<{ booking_id: string }>(
          db,
          "select booking_id from public.payments where stripe_payment_intent_id = $1",
          [pi],
        )
      )[0]?.booking_id ?? null,
  },
  stripe: {
    checkoutSession: async (id) => apiObject(id),
    charge: async (id) => apiObject(id),
    invoice: async (id) => apiObject(id),
    subscription: async (id) => {
      const sub = stripeSubscriptions.get(id);
      if (!sub) throw new Error(`No such subscription: ${id}`);
      return sub;
    },
  },
  sendJobs: async (events) => {
    if (failNextSend) {
      failNextSend = false;
      throw new Error("Inngest is down");
    }
    sent.push(...events.map((e) => ({ name: e.name, id: e.id })));
  },
  dbTag: "this-db",
};

/** Sessions, charges and invoices as the API returns them now (by default: as in the event). */
const stripeObjects = new Map<string, unknown>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a fake API returns loose objects
function apiObject(id: string): any {
  if (!stripeObjects.has(id)) throw new Error(`No such object: ${id}`);
  return stripeObjects.get(id);
}

function event(id: string, type: string, object: Record<string, unknown>): Stripe.Event {
  // Subscriptions live in stripeSubscriptions: there the event body and the API deliberately differ.
  if (typeof object.id === "string" && !type.startsWith("customer.subscription."))
    stripeObjects.set(object.id, object);
  return { id, type, object: "event", data: { object } } as unknown as Stripe.Event;
}

function checkoutCompleted(id: string, bookingId: string) {
  return event(id, "checkout.session.completed", {
    id: `cs_${bookingId}`,
    mode: "payment",
    payment_status: "paid",
    payment_intent: `pi_${bookingId}`,
    amount_total: annaClass.priceCents,
    currency: "gbp",
    metadata: { booking_id: bookingId },
  });
}

async function hold(): Promise<string> {
  const [row] = await asUser<{ id: string }>(
    db,
    CLIENT,
    "select id from public.book_slot($1, $2)",
    [annaClass.id, firstSlot.toISOString()],
  );
  return row!.id;
}

const status = async (bookingId: string) =>
  (
    await db.query<{ status: string }>("select status from public.bookings where id = $1", [
      bookingId,
    ])
  ).rows[0]!.status;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, CLIENT, "client@example.com", "Casey Client");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("handleStripeEvent", () => {
  it("delivered three times: one confirmation, one payment, one job id", async () => {
    await rolledBack(async () => {
      sent.length = 0;
      const bookingId = await hold();
      const evt = checkoutCompleted("evt_paid_1", bookingId);
      const results = [];
      for (let i = 0; i < 3; i++) results.push((await handleStripeEvent(evt, deps)).result);

      expect(results).toEqual(["confirmed", "duplicate", "duplicate"]);
      expect(await status(bookingId)).toBe("confirmed");
      const { rows } = await db.query("select 1 from public.payments where booking_id = $1", [
        bookingId,
      ]);
      expect(rows).toHaveLength(1);
      // The job is sent again on each retry, always with the same id: Inngest runs it once.
      expect(new Set(sent.map((e) => e.id))).toEqual(new Set([`evt_paid_1:confirmed`]));
      expect(sent.every((e) => e.name === "booking/confirmed")).toBe(true);
    });
  });

  it("a failed job hand-off fails the webhook, and Stripe's retry still sends the job", async () => {
    await rolledBack(async () => {
      sent.length = 0;
      const bookingId = await hold();
      const evt = checkoutCompleted("evt_paid_2", bookingId);
      failNextSend = true;
      await expect(handleStripeEvent(evt, deps)).rejects.toThrow(/Inngest is down/);
      // The database part is done; the retry is recognised as a duplicate…
      expect(await status(bookingId)).toBe("confirmed");
      expect((await handleStripeEvent(evt, deps)).result).toBe("duplicate");
      // …but the follow-up job is not lost.
      expect(sent).toEqual([{ name: "booking/confirmed", id: "evt_paid_2:confirmed" }]);
    });
  });

  it("checkout.session.expired after the payment changes nothing", async () => {
    await rolledBack(async () => {
      const bookingId = await hold();
      await handleStripeEvent(checkoutCompleted("evt_paid_3", bookingId), deps);
      const expired = event("evt_exp_3", "checkout.session.expired", {
        id: `cs_${bookingId}`,
        mode: "payment",
        status: "expired",
        metadata: { booking_id: bookingId },
      });
      expect((await handleStripeEvent(expired, deps)).result).toBe("ignored");
      expect(await status(bookingId)).toBe("confirmed");
    });
  });

  it("an 'expired' event for a session Stripe still reports open changes nothing", async () => {
    await rolledBack(async () => {
      const bookingId = await hold();
      const forged = event("evt_exp_open", "checkout.session.expired", {
        id: `cs_${bookingId}`,
        mode: "payment",
        status: "open",
        metadata: { booking_id: bookingId },
      });
      expect((await handleStripeEvent(forged, deps)).result).toBe("ignored");
      expect(await status(bookingId)).toBe("pending_payment");
    });
  });

  it("waits for delayed payment methods instead of confirming an unpaid session", async () => {
    await rolledBack(async () => {
      const bookingId = await hold();
      const unpaid = checkoutCompleted("evt_unpaid", bookingId);
      (unpaid.data.object as { payment_status: string }).payment_status = "unpaid";
      expect((await handleStripeEvent(unpaid, deps)).result).toBe("awaiting_payment");
      expect(await status(bookingId)).toBe("pending_payment");
    });
  });

  it("subscription events in the wrong order end in Stripe's current state", async () => {
    await rolledBack(async () => {
      stripeSubscriptions.set("sub_1", subscription("active"));
      // "updated" arrives first, then the older "created" whose body still says "incomplete".
      const updated = event("evt_sub_updated", "customer.subscription.updated", { id: "sub_1" });
      const created = event("evt_sub_created", "customer.subscription.created", {
        id: "sub_1",
        status: "incomplete",
      });
      await handleStripeEvent(updated, deps);
      await handleStripeEvent(created, deps);
      const read = async () =>
        (
          await db.query<{ plan: string; status: string }>(
            "select plan, status from public.provider_subscriptions where provider_id = $1",
            [anna.id],
          )
        ).rows[0];
      expect(await read()).toEqual({ plan: "pro", status: "active" });

      // A failed renewal: invoice.payment_failed → Stripe now says past_due.
      stripeSubscriptions.set("sub_1", subscription("past_due"));
      await handleStripeEvent(
        event("evt_inv_failed", "invoice.payment_failed", {
          id: "in_failed",
          parent: { subscription_details: { subscription: "sub_1" } },
        }),
        deps,
      );
      expect(await read()).toEqual({ plan: "pro", status: "past_due" });

      // Cancelled in Stripe; a late "updated" event (new id) still ends as cancelled → Free.
      stripeSubscriptions.set("sub_1", subscription("canceled"));
      await handleStripeEvent(
        event("evt_sub_late", "customer.subscription.updated", { id: "sub_1" }),
        deps,
      );
      expect(await read()).toEqual({ plan: "free", status: "canceled" });
    });
  });

  it("charge.refunded records the total and sends one refund job, also on retries", async () => {
    await rolledBack(async () => {
      sent.length = 0;
      const bookingId = await hold();
      await handleStripeEvent(checkoutCompleted("evt_paid_4", bookingId), deps);
      const refunded = event("evt_refund_4", "charge.refunded", {
        payment_intent: `pi_${bookingId}`,
        id: `ch_${bookingId}`,
        amount_refunded: annaClass.priceCents,
      });
      expect((await handleStripeEvent(refunded, deps)).result).toBe("refunded");
      expect((await handleStripeEvent(refunded, deps)).result).toBe("duplicate");
      const refundJobs = sent.filter((e) => e.name === "booking/refunded");
      expect(new Set(refundJobs.map((e) => e.id))).toEqual(new Set(["evt_refund_4:refunded"]));
    });
  });

  it("reads the session from the API, so an event in an old API version still works", async () => {
    await rolledBack(async () => {
      const bookingId = await hold();
      const current = checkoutCompleted("evt_old_shape", bookingId);
      // The account is pinned to API version 2019-02-19: its events lack payment_status and
      // amount_total. The API (read in the SDK version) returns the full current object.
      const old = event("evt_old_shape", "checkout.session.completed", {
        id: `cs_${bookingId}`,
        object: "checkout.session",
        display_items: [],
      });
      stripeObjects.set(`cs_${bookingId}`, current.data.object);
      expect((await handleStripeEvent(old, deps)).result).toBe("confirmed");
      expect(await status(bookingId)).toBe("confirmed");
    });
  });

  it("skips objects tagged for another database: no change, no error, no job", async () => {
    await rolledBack(async () => {
      sent.length = 0;
      const bookingId = await hold();
      const tagged = (tag: string) => ({ booking_id: bookingId, slotwise_db: tag });

      // A staging payment reaching the production endpoint. The booking id is real here, so a
      // missing check would confirm it; for a truly foreign one it would throw booking_not_found.
      const paid = checkoutCompleted("evt_foreign_paid", bookingId);
      (paid.data.object as { metadata: object }).metadata = tagged("other-db");
      expect((await handleStripeEvent(paid, deps)).result).toBe("foreign");
      expect(await status(bookingId)).toBe("pending_payment");

      const refunded = event("evt_foreign_refund", "charge.refunded", {
        id: "ch_foreign",
        payment_intent: "pi_unknown",
        amount_refunded: 100,
        metadata: tagged("other-db"),
      });
      expect((await handleStripeEvent(refunded, deps)).result).toBe("foreign");

      stripeSubscriptions.set("sub_1", {
        ...subscription("active"),
        metadata: { provider_id: anna.id, slotwise_db: "other-db" },
      } as Stripe.Subscription);
      const sub = event("evt_foreign_sub", "customer.subscription.updated", { id: "sub_1" });
      expect((await handleStripeEvent(sub, deps)).result).toBe("foreign");
      const subs = await db.query(
        "select 1 from public.provider_subscriptions where provider_id = $1",
        [anna.id],
      );
      expect(subs.rows).toHaveLength(0);
      expect(sent).toHaveLength(0);

      // Its own tag is handled as usual.
      const own = checkoutCompleted("evt_own_paid", bookingId);
      (own.data.object as { metadata: object }).metadata = tagged("this-db");
      expect((await handleStripeEvent(own, deps)).result).toBe("confirmed");
    });
  });

  it("ignores events it does not handle", async () => {
    expect((await handleStripeEvent(event("evt_other", "customer.created", {}), deps)).result).toBe(
      "ignored",
    );
  });
});
