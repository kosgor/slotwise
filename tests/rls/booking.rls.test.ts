// @vitest-environment node
//
// Stage 2 access rules on the real migrations (PGlite): profiles and roles, owners editing their
// provider profile, services and schedule, bookings via book_slot()/cancel_booking(), and data
// isolation between users. Supabase-specific pieces are stubbed in ./db.ts.

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAvailableSlots, localDayRange, nextLocalDates } from "@/lib/booking/slots";
import {
  availabilityExceptions,
  availabilityRules,
  providers,
  services,
} from "@/lib/catalog/seed-data";

import { asAnon, asUser, createTestDb, createUser, rolledBack as rolledBackIn } from "./db";

const CLIENT_A = "00000000-0000-4000-8000-0000000000a1";
const CLIENT_B = "00000000-0000-4000-8000-0000000000b2";
const PROVIDER = "00000000-0000-4000-8000-0000000000c3"; // owns anna-yoga
const OTHER_PROVIDER = "00000000-0000-4000-8000-0000000000d4"; // owns marcus-fitness
const ADMIN = "00000000-0000-4000-8000-0000000000e5";
const NEWCOMER = "00000000-0000-4000-8000-0000000000f6";

const anna = providers.find((p) => p.slug === "anna-yoga")!;
const marcus = providers.find((p) => p.slug === "marcus-fitness")!;
const annaClass = services.find((s) => s.providerId === anna.id && s.durationMin === 60)!;

let db: PGlite;

/** Free slots for Anna's 60-minute class on one local date, by the same TypeScript the booking page uses. */
function slotsOn(date: string): Date[] {
  return getAvailableSlots({
    rules: availabilityRules.filter((r) => r.providerId === anna.id),
    exceptions: availabilityExceptions.filter((e) => e.providerId === anna.id),
    busy: [],
    durationMin: annaClass.durationMin,
    timeZone: anna.timezone,
    ...localDayRange(date, anna.timezone),
    now: new Date(),
  });
}

// Upcoming dates on which Anna works (skips weekends and days off), so tests never depend on
// what weekday "today" is. Each test uses its own day to stay independent.
const WORK_DAYS = nextLocalDates(anna.timezone, new Date(), 45)
  .slice(1)
  .filter((d) => slotsOn(d).length > 0);
const annaSlots = (workDayIndexes: number[]) =>
  workDayIndexes.flatMap((i) => slotsOn(WORK_DAYS[i]!));

async function book(userId: string, startsAt: Date, serviceId = annaClass.id) {
  const rows = await asUser<{
    id: string;
    status: string;
    price_cents: number;
    client_email: string;
  }>(db, userId, "select * from public.book_slot($1, $2)", [serviceId, startsAt.toISOString()]);
  return rows[0]!;
}

const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, CLIENT_A, "a@example.com", "Alice Client");
  await createUser(db, CLIENT_B, "b@example.com", "Bob Client");
  await createUser(db, PROVIDER, "anna@example.com", "Anna Whitfield");
  await createUser(db, OTHER_PROVIDER, "marcus@example.com", "Marcus Hale");
  await createUser(db, ADMIN, "admin@example.com", "Admin");
  await createUser(db, NEWCOMER, "new@example.com", "Nina New");
  // What the demo-account script does with the service role.
  await db.exec(`
    update public.providers set user_id = '${PROVIDER}' where slug = 'anna-yoga';
    update public.providers set user_id = '${OTHER_PROVIDER}' where slug = 'marcus-fitness';
    update public.profiles set role = 'provider' where id in ('${PROVIDER}', '${OTHER_PROVIDER}');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("profiles", () => {
  it("are created on sign-up with role client and the name from sign-up metadata", async () => {
    const [me] = await asUser<{ role: string; full_name: string }>(
      db,
      CLIENT_A,
      "select role, full_name from public.profiles where id = $1",
      [CLIENT_A],
    );
    expect(me).toEqual({ role: "client", full_name: "Alice Client" });
  });

  it("are private: a user sees only their own, an admin sees all", async () => {
    expect(await asUser(db, CLIENT_A, "select id from public.profiles")).toHaveLength(1);
    expect((await asUser(db, ADMIN, "select id from public.profiles")).length).toBe(6);
    await expect(asAnon(db, "select id from public.profiles")).rejects.toThrow(/permission denied/);
  });

  it("let users change their name but never their role", async () => {
    await asUser(db, CLIENT_A, "update public.profiles set full_name = 'Alice A.' where id = $1", [
      CLIENT_A,
    ]);
    await expect(
      asUser(db, CLIENT_A, "update public.profiles set role = 'admin' where id = $1", [CLIENT_A]),
    ).rejects.toThrow(/permission denied/);
    // Updating someone else's profile matches zero rows.
    await asUser(db, CLIENT_A, "update public.profiles set full_name = 'hacked' where id = $1", [
      CLIENT_B,
    ]);
    const rows = await db.query<{ full_name: string }>(
      "select full_name from public.profiles where id = $1",
      [CLIENT_B],
    );
    expect(rows.rows[0]!.full_name).toBe("Bob Client");
  });
});

describe("becoming a provider", () => {
  it("creates a pending, unlisted profile and switches the role", async () => {
    const [p] = await asUser<{ slug: string; status: string }>(
      db,
      NEWCOMER,
      `select slug, status from public.apply_as_provider(
         'Nina New', 'Guitar for beginners', 'Hi!', 'music', 'Lisbon', 'Europe/Lisbon', true, false)`,
    );
    expect(p).toEqual({ slug: "nina-music", status: "pending" });
    const [profile] = await asUser<{ role: string }>(
      db,
      NEWCOMER,
      "select role from public.profiles",
    );
    expect(profile!.role).toBe("provider");
    // Not in the public catalog until an admin approves it, but the owner can see it.
    expect(
      await asAnon(db, "select 1 from public.providers where slug = 'nina-music'"),
    ).toHaveLength(0);
    expect(
      await asUser(db, NEWCOMER, "select 1 from public.providers where slug = 'nina-music'"),
    ).toHaveLength(1);
  });

  it("can be done only once and needs a real time zone", async () => {
    await expect(
      asUser(
        db,
        NEWCOMER,
        `select public.apply_as_provider('Nina', 'x', '', 'music', 'Lisbon', 'Europe/Lisbon', true, false)`,
      ),
    ).rejects.toThrow(/already_provider/);
    await expect(
      asUser(
        db,
        CLIENT_B,
        `select public.apply_as_provider('Bob', 'x', '', 'music', 'Lisbon', 'Mars/Olympus', true, false)`,
      ),
    ).rejects.toThrow(/invalid_timezone/);
  });

  it("is not available to anonymous visitors", async () => {
    await expect(
      asAnon(
        db,
        `select public.apply_as_provider('X', 'x', '', 'music', 'Lisbon', 'Europe/Lisbon', true, false)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("owners manage their provider data", () => {
  it("can edit their profile, but not its status or someone else's", async () => {
    await asUser(db, PROVIDER, "update public.providers set headline = 'Updated' where id = $1", [
      anna.id,
    ]);
    await expect(
      asUser(db, PROVIDER, "update public.providers set status = 'approved' where id = $1", [
        anna.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await asUser(
      db,
      OTHER_PROVIDER,
      "update public.providers set headline = 'hacked' where id = $1",
      [anna.id],
    );
    const { rows } = await db.query<{ headline: string }>(
      "select headline from public.providers where id = $1",
      [anna.id],
    );
    expect(rows[0]!.headline).toBe("Updated");
  });

  it("can add and edit their services only", async () => {
    await asUser(
      db,
      PROVIDER,
      // Inactive, so the Free plan limit (3 active services, payments.rls.test.ts) stays out of the way.
      "insert into public.services (provider_id, title, duration_min, price_cents, active) values ($1, 'New class', 45, 3000, false)",
      [anna.id],
    );
    await expect(
      asUser(
        db,
        OTHER_PROVIDER,
        "insert into public.services (provider_id, title, duration_min, price_cents) values ($1, 'Fake', 45, 1)",
        [anna.id],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, PROVIDER, "delete from public.services where provider_id = $1", [anna.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("can edit their schedule only, without overlapping hours", async () => {
    await rolledBack(async () => {
      await asUser(
        db,
        PROVIDER,
        "insert into public.availability_rules (provider_id, weekday, start_time, end_time) values ($1, 7, '10:00', '12:00')",
        [anna.id],
      );
      await expect(
        asUser(
          db,
          PROVIDER,
          "insert into public.availability_rules (provider_id, weekday, start_time, end_time) values ($1, 7, '11:00', '13:00')",
          [anna.id],
        ),
      ).rejects.toThrow(/availability_rules_no_overlap/);
    });
    await expect(
      asUser(
        db,
        OTHER_PROVIDER,
        "insert into public.availability_rules (provider_id, weekday, start_time, end_time) values ($1, 7, '10:00', '12:00')",
        [anna.id],
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("book_slot", () => {
  it("accepts every slot the TypeScript slot calculation offers (the two rule sets agree)", async () => {
    const slots = annaSlots([0, 1, 2, 3, 4]);
    expect(slots.length).toBeGreaterThan(20);
    for (const slot of slots) {
      await rolledBack(async () => {
        const booking = await book(CLIENT_A, slot);
        // Paid service: a 15-minute hold until Stripe confirms the payment (stage 3).
        expect(booking.status).toBe("pending_payment");
      });
    }
  });

  it("rejects times outside the schedule, off the 30-minute grid or across a break", async () => {
    // A day with the plain schedule (09:00–13:00, 14:00–18:00): on a day with blocked hours the
    // first slot is later, and "4 hours after it" can land inside working hours.
    const plainDay = WORK_DAYS.slice(5).find(
      (d) => !availabilityExceptions.some((e) => e.providerId === anna.id && e.date === d),
    )!;
    const [first] = slotsOn(plainDay);
    const at = (minutesFromFirst: number) => new Date(first!.getTime() + minutesFromFirst * 60_000);
    for (const bad of [at(15), at(-60), at(4 * 60)]) {
      await rolledBack(async () => {
        await expect(book(CLIENT_A, bad)).rejects.toThrow(/slot_unavailable/);
      });
    }
  });

  it("rejects starts with less than an hour of notice", async () => {
    await expect(book(CLIENT_A, new Date(Date.now() + 30 * 60_000))).rejects.toThrow(
      /slot_unavailable/,
    );
  });

  it("takes the price from the database and snapshots the details", async () => {
    await rolledBack(async () => {
      const [slot] = annaSlots([6]);
      const booking = await book(CLIENT_A, slot!);
      expect(booking.price_cents).toBe(annaClass.priceCents);
      expect(booking.client_email).toBe("a@example.com");
    });
  });

  it("prevents double booking but allows back-to-back sessions", async () => {
    await rolledBack(async () => {
      const [slot] = annaSlots([7]);
      await book(CLIENT_A, slot!);
      await expect(book(CLIENT_B, slot!)).rejects.toThrow(/slot_taken/);
      await expect(book(CLIENT_B, new Date(slot!.getTime() + 30 * 60_000))).rejects.toThrow(
        /slot_taken/,
      );
      const backToBack = await book(CLIENT_B, new Date(slot!.getTime() + 60 * 60_000));
      expect(backToBack.status).toBe("pending_payment");
    });
  });

  it("does not let providers book themselves or anonymous visitors book at all", async () => {
    const [slot] = annaSlots([8]);
    await expect(book(PROVIDER, slot!)).rejects.toThrow(/own_service/);
    await expect(
      asAnon(db, "select public.book_slot($1, $2)", [annaClass.id, slot!.toISOString()]),
    ).rejects.toThrow(/permission denied/);
  });

  it("is the only way to create a booking: direct inserts are refused", async () => {
    const [slot] = annaSlots([9]);
    await expect(
      asUser(
        db,
        CLIENT_A,
        `insert into public.bookings (provider_id, client_id, service_id, starts_at, ends_at, price_cents, currency,
           service_title, duration_min, provider_name, provider_timezone, client_name, client_email)
         values ($1, $2, $3, $4, $4::timestamptz + interval '1 hour', 0, 'GBP', 'x', 60, 'x', 'UTC', 'x', 'x')`,
        [anna.id, CLIENT_A, annaClass.id, slot!.toISOString()],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("booking visibility", () => {
  let bookingId: string;

  beforeAll(async () => {
    const [slot] = annaSlots([10]);
    bookingId = (await book(CLIENT_A, slot!)).id;
  });

  it("the client and the provider see the booking; other users and visitors do not", async () => {
    const select = "select id from public.bookings where id = $1";
    expect(await asUser(db, CLIENT_A, select, [bookingId])).toHaveLength(1);
    expect(await asUser(db, PROVIDER, select, [bookingId])).toHaveLength(1);
    expect(await asUser(db, ADMIN, select, [bookingId])).toHaveLength(1);
    expect(await asUser(db, CLIENT_B, select, [bookingId])).toHaveLength(0);
    expect(await asUser(db, OTHER_PROVIDER, select, [bookingId])).toHaveLength(0);
    await expect(asAnon(db, select, [bookingId])).rejects.toThrow(/permission denied/);
  });

  it("nobody can change a booking directly", async () => {
    await expect(
      asUser(db, CLIENT_A, "update public.bookings set price_cents = 0 where id = $1", [bookingId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("busy intervals are public, but without who booked them", async () => {
    const rows = await asAnon<Record<string, unknown>>(
      db,
      "select * from public.provider_busy_intervals($1, now(), now() + interval '30 days')",
      [anna.id],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]!).sort()).toEqual(["ends_at", "starts_at"]);
  });
});

describe("cancel_booking", () => {
  /** Inserts a confirmed (paid) booking directly (as the database owner) at a given offset from now. */
  async function bookingIn(hours: number, clientId = CLIENT_A): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.bookings (provider_id, client_id, service_id, starts_at, ends_at, status, price_cents, currency,
         service_title, duration_min, provider_name, provider_timezone, client_name, client_email)
       values ($1, $2, $3, now() + make_interval(hours => $4), now() + make_interval(hours => $4 + 1),
         'confirmed', 4500, 'GBP', 'Class', 60, 'Anna', 'Europe/London', 'Alice', 'a@example.com')
       returning id`,
      [marcus.id, clientId, services.find((s) => s.providerId === marcus.id)!.id, hours],
    );
    return rows[0]!.id;
  }
  const cancel = (userId: string, id: string) =>
    asUser<{ status: string }>(db, userId, "select status from public.cancel_booking($1)", [id]);

  it("lets the client cancel 24 hours or more before the start", async () => {
    const id = await bookingIn(48);
    expect((await cancel(CLIENT_A, id))[0]!.status).toBe("cancelled");
    await expect(cancel(CLIENT_A, id)).rejects.toThrow(/not_cancellable/);
  });

  it("refuses a late cancellation by the client but allows it for the provider", async () => {
    const id = await bookingIn(5);
    await expect(cancel(CLIENT_A, id)).rejects.toThrow(/too_late_to_cancel/);
    expect((await cancel(OTHER_PROVIDER, id))[0]!.status).toBe("cancelled");
  });

  it("answers 'not found' to strangers, without revealing that the booking exists", async () => {
    const id = await bookingIn(48);
    await expect(cancel(CLIENT_B, id)).rejects.toThrow(/booking_not_found/);
    await expect(cancel(PROVIDER, id)).rejects.toThrow(/booking_not_found/);
  });

  it("frees the slot: a cancelled booking no longer blocks the time", async () => {
    await rolledBack(async () => {
      const [slot] = annaSlots([11]);
      const first = await book(CLIENT_A, slot!);
      await asUser(db, CLIENT_A, "select public.cancel_booking($1)", [first.id]);
      expect((await book(CLIENT_B, slot!)).status).toBe("pending_payment");
    });
  });
});

describe("reschedule_booking", () => {
  /** A confirmed, paid booking of Anna's class for CLIENT_A, inserted as the database owner. */
  async function confirmedAt(startsAt: Date, status = "confirmed"): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.bookings (provider_id, client_id, service_id, starts_at, ends_at, status, price_cents,
         paid_cents, currency, service_title, duration_min, provider_name, provider_timezone, client_name, client_email)
       values ($1, $2, $3, $4, $4::timestamptz + make_interval(mins => $5), $6, $7, $7, 'GBP', 'Class', $5,
         'Anna', 'Europe/London', 'Alice', 'a@example.com')
       returning id`,
      [
        anna.id,
        CLIENT_A,
        annaClass.id,
        startsAt.toISOString(),
        annaClass.durationMin,
        status,
        annaClass.priceCents,
      ],
    );
    return rows[0]!.id;
  }
  const move = (userId: string, id: string, startsAt: Date) =>
    asUser<{
      starts_at: string;
      ends_at: string;
      price_cents: number;
      paid_cents: number;
      rescheduled_by: string;
    }>(db, userId, "select * from public.reschedule_booking($1, $2)", [id, startsAt.toISOString()]);
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);

  it("accepts every slot the TypeScript slot calculation offers (the two rule sets agree)", async () => {
    const [from] = annaSlots([12]);
    const slots = annaSlots([13, 14]);
    expect(slots.length).toBeGreaterThan(8);
    for (const slot of slots) {
      await rolledBack(async () => {
        const id = await confirmedAt(from!);
        expect(new Date((await move(CLIENT_A, id, slot))[0]!.starts_at)).toEqual(slot);
      });
    }
  });

  it("moves the same booking: price and payment stay, the old time is free again", async () => {
    await rolledBack(async () => {
      const [from] = annaSlots([15]);
      const [to] = annaSlots([16]);
      const id = await confirmedAt(from!);
      const [moved] = await move(CLIENT_A, id, to!);
      expect(new Date(moved!.starts_at)).toEqual(to);
      expect(new Date(moved!.ends_at).getTime() - to!.getTime()).toBe(
        annaClass.durationMin * 60_000,
      );
      expect(moved!.price_cents).toBe(annaClass.priceCents);
      expect(moved!.paid_cents).toBe(annaClass.priceCents);
      expect(moved!.rescheduled_by).toBe(CLIENT_A);
      expect((await book(CLIENT_B, from!)).status).toBe("pending_payment");
    });
  });

  it("refuses a late move by the client but allows it for the provider", async () => {
    await rolledBack(async () => {
      const id = await confirmedAt(hoursFromNow(5));
      const [to] = annaSlots([17]);
      await expect(move(CLIENT_A, id, to!)).rejects.toThrow(/too_late_to_reschedule/);
      expect((await move(PROVIDER, id, to!))[0]!.rescheduled_by).toBe(PROVIDER);
    });
  });

  it("answers 'not found' to strangers and refuses anonymous visitors", async () => {
    await rolledBack(async () => {
      const [from] = annaSlots([18]);
      const [to] = annaSlots([19]);
      const id = await confirmedAt(from!);
      await expect(move(CLIENT_B, id, to!)).rejects.toThrow(/booking_not_found/);
      await expect(move(OTHER_PROVIDER, id, to!)).rejects.toThrow(/booking_not_found/);
      await expect(
        asAnon(db, "select public.reschedule_booking($1, $2)", [id, to!.toISOString()]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("follows the booking rules: schedule, same time, taken time, overlap with itself", async () => {
    await rolledBack(async () => {
      const [from, next] = annaSlots([20]);
      const [taken] = annaSlots([21]);
      const id = await confirmedAt(from!);
      await expect(move(PROVIDER, id, new Date(from!.getTime() + 15 * 60_000))).rejects.toThrow(
        /slot_unavailable/,
      );
      await expect(move(PROVIDER, id, hoursFromNow(0.5))).rejects.toThrow(/slot_unavailable/);
      await expect(move(CLIENT_A, id, from!)).rejects.toThrow(/same_time/);
      await book(CLIENT_B, taken!);
      await expect(move(CLIENT_A, id, taken!)).rejects.toThrow(/slot_taken/);
      // Half an hour later overlaps only the booking's own old time.
      expect(new Date((await move(CLIENT_A, id, next!))[0]!.starts_at)).toEqual(next);
    });
  });

  it("moves only confirmed bookings", async () => {
    await rolledBack(async () => {
      const [from] = annaSlots([22]);
      const [to] = annaSlots([23]);
      const cancelled = await confirmedAt(from!, "cancelled");
      await expect(move(CLIENT_A, cancelled, to!)).rejects.toThrow(/not_reschedulable/);
      const hold = await confirmedAt(from!, "pending_payment");
      await expect(move(CLIENT_A, hold, to!)).rejects.toThrow(/not_reschedulable/);
    });
  });

  it("is not available while the provider is suspended", async () => {
    await rolledBack(async () => {
      const [from] = annaSlots([24]);
      const [to] = annaSlots([25]);
      const id = await confirmedAt(from!);
      await db.query("update public.providers set status = 'suspended' where id = $1", [anna.id]);
      await expect(move(CLIENT_A, id, to!)).rejects.toThrow(/not_reschedulable/);
    });
  });
});

describe("replace_availability_rules", () => {
  const rules = (list: [number, string, string][]) =>
    JSON.stringify(
      list.map(([weekday, start_time, end_time]) => ({ weekday, start_time, end_time })),
    );
  const count = async () =>
    (
      await db.query<{ n: number }>(
        "select count(*)::int as n from public.availability_rules where provider_id = $1",
        [anna.id],
      )
    ).rows[0]!.n;

  it("replaces the whole weekly schedule in one step", async () => {
    await rolledBack(async () => {
      await asUser(db, PROVIDER, "select * from public.replace_availability_rules($1, $2::jsonb)", [
        anna.id,
        rules([
          [1, "08:00", "12:00"],
          [3, "10:00", "14:00"],
        ]),
      ]);
      expect(await count()).toBe(2);
    });
  });

  it("keeps the old schedule when the new one is invalid (all or nothing)", async () => {
    const before = await count();
    await expect(
      asUser(db, PROVIDER, "select * from public.replace_availability_rules($1, $2::jsonb)", [
        anna.id,
        rules([
          [1, "08:00", "12:00"],
          [1, "11:00", "13:00"],
        ]),
      ]),
    ).rejects.toThrow(/availability_rules_no_overlap/);
    expect(await count()).toBe(before);
  });

  it("refuses to touch another provider's schedule", async () => {
    await expect(
      asUser(db, OTHER_PROVIDER, "select * from public.replace_availability_rules($1, $2::jsonb)", [
        anna.id,
        rules([[1, "08:00", "12:00"]]),
      ]),
    ).rejects.toThrow(/not_owner/);
  });
});
