// @vitest-environment node
//
// Stage 3 database rules on the real migrations (PGlite): payment holds, webhook effects
// (idempotency, any order of events), refunds, subscriptions and plan limits, and who may call
// what. The Stripe side is simulated by calling the webhook functions with event data.

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAvailableSlots, localDayRange, nextLocalDates } from "@/lib/booking/slots";
import {
  availabilityExceptions,
  availabilityRules,
  providers,
  services,
} from "@/lib/catalog/seed-data";

import {
  asAnon,
  asService,
  asUser,
  createTestDb,
  createUser,
  rolledBack as rolledBackIn,
} from "./db";

const CLIENT_A = "00000000-0000-4000-8000-0000000000a1";
const CLIENT_B = "00000000-0000-4000-8000-0000000000b2";
const PROVIDER = "00000000-0000-4000-8000-0000000000c3"; // owns anna-yoga
const OTHER_PROVIDER = "00000000-0000-4000-8000-0000000000d4"; // owns marcus-fitness

const anna = providers.find((p) => p.slug === "anna-yoga")!;
const marcus = providers.find((p) => p.slug === "marcus-fitness")!;
const annaClass = services.find((s) => s.providerId === anna.id && s.durationMin === 60)!;

let db: PGlite;
const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);

const WORK_DAYS = nextLocalDates(anna.timezone, new Date(), 45)
  .slice(1)
  .filter(
    (d) =>
      getAvailableSlots({
        rules: availabilityRules.filter((r) => r.providerId === anna.id),
        exceptions: availabilityExceptions.filter((e) => e.providerId === anna.id),
        busy: [],
        durationMin: annaClass.durationMin,
        timeZone: anna.timezone,
        ...localDayRange(d, anna.timezone),
        now: new Date(),
      }).length > 0,
  );
/** First free slot of Anna's 60-minute class on the n-th upcoming work day. */
function slot(n: number): Date {
  return getAvailableSlots({
    rules: availabilityRules.filter((r) => r.providerId === anna.id),
    exceptions: availabilityExceptions.filter((e) => e.providerId === anna.id),
    busy: [],
    durationMin: annaClass.durationMin,
    timeZone: anna.timezone,
    ...localDayRange(WORK_DAYS[n]!, anna.timezone),
    now: new Date(),
  })[0]!;
}

type BookingRow = {
  id: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  paid_cents: number;
  refunded_cents: number;
};

async function book(userId: string, startsAt: Date, serviceId = annaClass.id) {
  const rows = await asUser<BookingRow>(db, userId, "select * from public.book_slot($1, $2)", [
    serviceId,
    startsAt.toISOString(),
  ]);
  return rows[0]!;
}

async function bookingById(id: string) {
  const { rows } = await db.query<BookingRow>("select * from public.bookings where id = $1", [id]);
  return rows[0]!;
}

/** Moves a hold's deadline into the past, as if 15 minutes had gone by. */
async function letHoldExpire(id: string) {
  await db.query(
    "update public.bookings set expires_at = now() - interval '1 second' where id = $1",
    [id],
  );
}

let eventCounter = 0;
const newEventId = () => `evt_test_${++eventCounter}`;

function checkoutCompleted(
  bookingId: string,
  { eventId = newEventId(), paymentIntent = `pi_${bookingId}`, amount = annaClass.priceCents } = {},
) {
  return asService<{ result: string }>(
    db,
    "select public.stripe_checkout_completed($1, 'checkout.session.completed', $2, $3, $4, $5, 'gbp') as result",
    [eventId, bookingId, `cs_${bookingId}`, paymentIntent, amount],
  ).then((rows) => rows[0]!.result);
}

function checkoutExpired(bookingId: string, eventId = newEventId()) {
  return asService<{ result: string }>(
    db,
    "select public.stripe_checkout_expired($1, 'checkout.session.expired', $2) as result",
    [eventId, bookingId],
  ).then((rows) => rows[0]!.result);
}

function chargeRefunded(paymentIntent: string, totalRefunded: number, eventId = newEventId()) {
  return asService<{ booking_id: string | null }>(
    db,
    "select public.stripe_charge_refunded($1, 'charge.refunded', $2, $3) as booking_id",
    [eventId, paymentIntent, totalRefunded],
  ).then((rows) => rows[0]!.booking_id);
}

function syncSubscription(
  providerId: string,
  plan: "free" | "pro",
  status: string,
  eventId = newEventId(),
) {
  return asService<{ result: string }>(
    db,
    `select public.stripe_sync_subscription($1, 'customer.subscription.updated', $2, $3, $4, $5, $6,
       'slotwise_pro_monthly', now() + interval '30 days', false) as result`,
    [
      eventId,
      providerId,
      `cus_${providerId.slice(-4)}`,
      `sub_${providerId.slice(-4)}`,
      plan,
      status,
    ],
  ).then((rows) => rows[0]!.result);
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, CLIENT_A, "a@example.com", "Alice Client");
  await createUser(db, CLIENT_B, "b@example.com", "Bob Client");
  await createUser(db, PROVIDER, "anna@example.com", "Anna Whitfield");
  await createUser(db, OTHER_PROVIDER, "marcus@example.com", "Marcus Hale");
  await db.exec(`
    update public.providers set user_id = '${PROVIDER}' where slug = 'anna-yoga';
    update public.providers set user_id = '${OTHER_PROVIDER}' where slug = 'marcus-fitness';
    update public.profiles set role = 'provider' where id in ('${PROVIDER}', '${OTHER_PROVIDER}');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("payment holds", () => {
  it("holds a paid slot for 15 minutes; a free service is confirmed at once", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(0));
      expect(held.status).toBe("pending_payment");
      const minutes = (Date.parse(held.expires_at!) - Date.parse(held.created_at)) / 60_000;
      expect(minutes).toBeCloseTo(15, 1);

      await db.query("update public.services set price_cents = 0 where id = $1", [annaClass.id]);
      const free = await book(CLIENT_A, slot(1));
      expect(free.status).toBe("confirmed");
      expect(free.expires_at).toBeNull();
    });
  });

  it("blocks the slot while the hold is active and frees it once the time is up", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(2));
      await expect(book(CLIENT_B, slot(2))).rejects.toThrow(/slot_taken/);

      await letHoldExpire(held.id);
      const busy = await asAnon<{ starts_at: string }>(
        db,
        "select * from public.provider_busy_intervals($1, $2, $3)",
        [anna.id, slot(2).toISOString(), new Date(slot(2).getTime() + 3_600_000).toISOString()],
      );
      expect(busy).toHaveLength(0);

      // Without waiting for the expiry job: book_slot marks the stale hold itself.
      expect((await book(CLIENT_B, slot(2))).status).toBe("pending_payment");
      expect((await bookingById(held.id)).status).toBe("expired");
    });
  });

  it("allows at most 3 unpaid holds per client", async () => {
    await rolledBack(async () => {
      for (const n of [3, 4, 5]) await book(CLIENT_A, slot(n));
      await expect(book(CLIENT_A, slot(6))).rejects.toThrow(/too_many_holds/);
      expect((await book(CLIENT_B, slot(6))).status).toBe("pending_payment");
    });
  });

  it("lets the client extend their own hold, but not past 25 minutes after booking", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(7));
      await expect(
        asUser(db, CLIENT_B, "select public.extend_payment_hold($1)", [held.id]),
      ).rejects.toThrow(/booking_not_found/);

      // 12 minutes later: extending gives the full cap of created_at + 25 min.
      await db.query(
        "update public.bookings set created_at = now() - interval '12 minutes', expires_at = now() + interval '3 minutes' where id = $1",
        [held.id],
      );
      const [extended] = await asUser<BookingRow>(
        db,
        CLIENT_A,
        "select * from public.extend_payment_hold($1)",
        [held.id],
      );
      const left = (Date.parse(extended!.expires_at!) - Date.now()) / 60_000;
      expect(left).toBeGreaterThan(12.5);
      expect(left).toBeLessThan(13.5);
      await expect(
        asUser(db, CLIENT_A, "select public.extend_payment_hold($1)", [held.id]),
      ).rejects.toThrow(/hold_not_extendable/);

      await letHoldExpire(held.id);
      await expect(
        asUser(db, CLIENT_A, "select public.extend_payment_hold($1)", [held.id]),
      ).rejects.toThrow(/hold_expired/);
    });
  });

  it("lets the client release an unpaid hold at any time (no 24-hour rule)", async () => {
    await rolledBack(async () => {
      // Tomorrow-ish slot: inside 24 hours would block cancelling a *paid* booking.
      const held = await book(CLIENT_A, slot(0));
      await db.query(
        "update public.bookings set starts_at = now() + interval '3 hours', ends_at = now() + interval '4 hours' where id = $1",
        [held.id],
      );
      const [cancelled] = await asUser<BookingRow>(
        db,
        CLIENT_A,
        "select * from public.cancel_booking($1)",
        [held.id],
      );
      expect(cancelled!.status).toBe("cancelled");
    });
  });
});

describe("webhook: checkout.session.completed", () => {
  it("confirms the booking once, however many times the same event arrives", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(8));
      const eventId = newEventId();
      const results = [];
      for (let i = 0; i < 3; i++) results.push(await checkoutCompleted(held.id, { eventId }));
      expect(results).toEqual(["confirmed", "duplicate", "duplicate"]);

      const booking = await bookingById(held.id);
      expect(booking.status).toBe("confirmed");
      expect(booking.expires_at).toBeNull();
      expect(booking.paid_cents).toBe(annaClass.priceCents);
      const { rows } = await db.query("select * from public.payments where booking_id = $1", [
        held.id,
      ]);
      expect(rows).toHaveLength(1);
    });
  });

  it("does not count the same payment twice when it comes in a different event", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(9));
      expect(await checkoutCompleted(held.id)).toBe("confirmed");
      expect(await checkoutCompleted(held.id)).toBe("already_confirmed");
      expect((await bookingById(held.id)).paid_cents).toBe(annaClass.priceCents);
    });
  });

  it("ignores a late 'expired' event after the payment, in any order", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(10));
      expect(await checkoutCompleted(held.id)).toBe("confirmed");
      expect(await checkoutExpired(held.id)).toBe("ignored");
      expect((await bookingById(held.id)).status).toBe("confirmed");
    });
  });

  it("keeps a booking paid after its hold expired, if the slot is still free", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(11));
      expect(await checkoutExpired(held.id)).toBe("expired");
      expect(await checkoutCompleted(held.id)).toBe("confirmed");
      expect((await bookingById(held.id)).status).toBe("confirmed");
    });
  });

  it("asks for a refund when the slot was taken after the hold expired", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(12));
      await letHoldExpire(held.id);
      await book(CLIENT_B, slot(12)); // takes the slot
      expect(await checkoutCompleted(held.id)).toBe("refund_needed");
      const booking = await bookingById(held.id);
      expect(booking.status).toBe("expired");
      expect(booking.paid_cents).toBe(annaClass.priceCents); // recorded, to be refunded
    });
  });

  it("asks for a refund when the amount does not match the price in the database", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(13));
      expect(await checkoutCompleted(held.id, { amount: 100 })).toBe("refund_needed");
      expect((await bookingById(held.id)).status).toBe("pending_payment");
    });
  });

  it("rejects unknown bookings without recording the event, so Stripe retries", async () => {
    const eventId = newEventId();
    await expect(
      checkoutCompleted("00000000-0000-4000-8000-00000000dead", { eventId }),
    ).rejects.toThrow(/booking_not_found/);
    const { rows } = await db.query("select 1 from public.stripe_events where id = $1", [eventId]);
    expect(rows).toHaveLength(0);
  });
});

describe("webhook: charge.refunded", () => {
  it("fails until the payment is recorded, then applies the highest refunded total", async () => {
    await rolledBack(async () => {
      const held = await book(CLIENT_A, slot(14));
      const pi = `pi_${held.id}`;
      // Refund event first (out of order): error → Stripe retries later.
      await expect(chargeRefunded(pi, annaClass.priceCents)).rejects.toThrow(/payment_not_found/);

      await checkoutCompleted(held.id);
      await asUser(db, CLIENT_A, "select public.cancel_booking($1)", [held.id]);
      // A newer event with the full refund, then an older one with a partial total.
      expect(await chargeRefunded(pi, annaClass.priceCents)).toBe(held.id);
      await chargeRefunded(pi, 1000);

      expect((await bookingById(held.id)).refunded_cents).toBe(annaClass.priceCents);
      const { rows } = await db.query<{ status: string }>(
        "select status from public.payments where stripe_payment_intent_id = $1",
        [pi],
      );
      expect(rows[0]!.status).toBe("refunded");
    });
  });
});

describe("subscriptions and plan limits", () => {
  const addService = (userId: string, providerId: string) =>
    asUser(
      db,
      userId,
      "insert into public.services (provider_id, title, duration_min, price_cents) values ($1, 'Extra', 30, 2000)",
      [providerId],
    );

  it("limits the Free plan to 3 active services, Pro to none, past_due back to 3", async () => {
    await rolledBack(async () => {
      const active = services.filter((s) => s.providerId === anna.id && s.active).length;
      for (let n = active; n < 3; n++) await addService(PROVIDER, anna.id);
      await expect(addService(PROVIDER, anna.id)).rejects.toThrow(/plan_limit/);
      // An inactive draft is fine: only active services count.
      await asUser(
        db,
        PROVIDER,
        "insert into public.services (provider_id, title, duration_min, price_cents, active) values ($1, 'Draft', 30, 2000, false)",
        [anna.id],
      );

      expect(await syncSubscription(anna.id, "pro", "active")).toBe("synced");
      await addService(PROVIDER, anna.id);

      await syncSubscription(anna.id, "pro", "past_due");
      await expect(addService(PROVIDER, anna.id)).rejects.toThrow(/plan_limit/);
    });
  });

  it("applies the state it is given, whatever order the events come in", async () => {
    await rolledBack(async () => {
      // "updated" (already reflecting the current Stripe state) processed before "created".
      await syncSubscription(marcus.id, "pro", "active");
      await syncSubscription(marcus.id, "pro", "active");
      const eventId = newEventId();
      await syncSubscription(marcus.id, "pro", "active", eventId);
      expect(await syncSubscription(marcus.id, "free", "canceled", eventId)).toBe("duplicate");
      const [row] = await asUser<{ plan: string; status: string }>(
        db,
        OTHER_PROVIDER,
        "select plan, status from public.provider_subscriptions",
      );
      expect(row).toEqual({ plan: "pro", status: "active" });
    });
  });

  it("shows a subscription only to its provider", async () => {
    await rolledBack(async () => {
      await syncSubscription(anna.id, "pro", "active");
      expect(
        await asUser(db, PROVIDER, "select * from public.provider_subscriptions"),
      ).toHaveLength(1);
      expect(
        await asUser(db, OTHER_PROVIDER, "select * from public.provider_subscriptions"),
      ).toHaveLength(0);
      expect(
        await asUser(db, CLIENT_A, "select * from public.provider_subscriptions"),
      ).toHaveLength(0);
    });
  });
});

describe("server-only data and functions", () => {
  it("hides payments and Stripe events from users", async () => {
    for (const table of ["payments", "stripe_events"]) {
      await expect(asUser(db, CLIENT_A, `select * from public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(asAnon(db, `select * from public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it("does not let users call webhook effects or the expiry job", async () => {
    const held = await rolledBack(async () => {
      const b = await book(CLIENT_A, slot(15));
      for (const sql of [
        "select public.stripe_checkout_completed('evt_x', 't', $1, 'cs', 'pi', 1, 'gbp')",
        "select public.stripe_checkout_expired('evt_x', 't', $1)",
      ]) {
        await expect(asUser(db, CLIENT_A, sql, [b.id])).rejects.toThrow(/permission denied/);
      }
      await expect(
        asUser(db, CLIENT_A, "select * from public.expire_stale_bookings()"),
      ).rejects.toThrow(/permission denied/);
      return b;
    });
    expect(held.status).toBe("pending_payment");
  });

  it("expire_stale_bookings marks only holds whose time is up and returns their sessions", async () => {
    await rolledBack(async () => {
      const stale = await book(CLIENT_A, slot(16));
      const fresh = await book(CLIENT_B, slot(17));
      await db.query(
        "update public.bookings set stripe_checkout_session_id = 'cs_stale' where id = $1",
        [stale.id],
      );
      await letHoldExpire(stale.id);
      const rows = await asService<{ booking_id: string; stripe_checkout_session_id: string }>(
        db,
        "select * from public.expire_stale_bookings()",
      );
      expect(rows).toEqual([{ booking_id: stale.id, stripe_checkout_session_id: "cs_stale" }]);
      expect((await bookingById(fresh.id)).status).toBe("pending_payment");
    });
  });
});
