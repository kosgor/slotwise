// @vitest-environment node
//
// remove_provider() on the real migrations: only admins, a reason is required, future bookings are
// cancelled (and listed for the refund job), the profile is anonymised but the money history and
// the audit log stay, and the account cannot open a second provider profile.

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

const ADMIN = "00000000-0000-4000-8000-0000000000e7";
const CLIENT = "00000000-0000-4000-8000-0000000000a7";
const OWNER = "00000000-0000-4000-8000-0000000000b7";
const anna = providers.find((p) => p.slug === "anna-yoga")!;
const annaClass = services.find((s) => s.providerId === anna.id && s.durationMin === 60)!;

let db: PGlite;
const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);

/** Two free future slots of Anna's 60-minute class. */
const [slotA, slotB] = nextLocalDates(anna.timezone, new Date(), 30)
  .slice(1)
  .flatMap((d) =>
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
  .filter((_, i, all) => i === 0 || i === all.length - 1);

const remove = (userId: string, reason: string) =>
  asUser<{ r: { cancelled: { bookingId: string; wasConfirmed: boolean }[] } }>(
    db,
    userId,
    "select public.remove_provider($1, $2) as r",
    [anna.id, reason],
  );

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0]!;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ADMIN, "admin@example.com", "Admin");
  await createUser(db, CLIENT, "client@example.com", "Casey Client");
  await createUser(db, OWNER, "anna@example.com", "Anna Whitfield");
  await db.exec(`update public.profiles set role = 'admin' where id = '${ADMIN}'`);
  // Anna's seed profile gets an account, like a real provider.
  await db.exec(`update public.providers set user_id = '${OWNER}' where id = '${anna.id}'`);
  await db.exec(`update public.profiles set role = 'provider' where id = '${OWNER}'`);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("remove_provider", () => {
  it("is for admins only; the reason is optional", async () => {
    await expect(remove(CLIENT, "spam")).rejects.toThrow(/not_admin/);
    await expect(remove(OWNER, "leaving")).rejects.toThrow(/not_admin/);
    await expect(asAnon(db, "select public.remove_provider($1, 'x')", [anna.id])).rejects.toThrow(
      /permission denied/,
    );
    await rolledBack(async () => {
      await remove(ADMIN, "   ");
      const row = await one<{ status: string; review_note: string | null }>(
        "select status, review_note from public.providers where id = $1",
        [anna.id],
      );
      expect(row).toEqual({ status: "removed", review_note: null });
    });
  });

  it("cancels future bookings, anonymises the profile, keeps the money history and logs it", async () => {
    await rolledBack(async () => {
      // A paid booking and an unpaid hold in the future, and one that already happened.
      const [paid] = await asUser<{ id: string }>(
        db,
        CLIENT,
        "select id from public.book_slot($1, $2)",
        [annaClass.id, slotA!.toISOString()],
      );
      await asService(
        db,
        "select public.stripe_checkout_completed('evt_rm_1', 'checkout.session.completed', $1, 'cs_rm', 'pi_rm', $2, 'gbp')",
        [paid!.id, annaClass.priceCents],
      );
      const [hold] = await asUser<{ id: string }>(
        db,
        CLIENT,
        "select id from public.book_slot($1, $2)",
        [annaClass.id, slotB!.toISOString()],
      );
      const { id: past } = await one<{ id: string }>(
        `insert into public.bookings (provider_id, client_id, service_id, starts_at, ends_at, status,
           price_cents, currency, service_title, duration_min, provider_name, provider_timezone,
           client_name, client_email)
         values ($1, $2, $3, now() - interval '2 days', now() - interval '2 days' + interval '1 hour',
           'completed', 4500, 'GBP', 'Yoga', 60, 'Anna Whitfield', 'Europe/London', 'Casey', 'client@example.com')
         returning id`,
        [anna.id, CLIENT, annaClass.id],
      );

      const [{ r }] = (await remove(ADMIN, "Fake profile")) as [
        { r: { cancelled: unknown[]; userId: string } },
      ];
      expect(r.userId).toBe(OWNER);
      expect(r.cancelled).toEqual(
        expect.arrayContaining([
          { bookingId: paid!.id, wasConfirmed: true },
          { bookingId: hold!.id, wasConfirmed: false },
        ]),
      );
      expect(r.cancelled).toHaveLength(2);

      const bookings = (
        await db.query<{ id: string; status: string; provider_name: string; paid_cents: number }>(
          "select id, status, provider_name, paid_cents from public.bookings where provider_id = $1",
          [anna.id],
        )
      ).rows;
      const byId = new Map(bookings.map((b) => [b.id, b]));
      expect(byId.get(paid!.id)).toMatchObject({
        status: "cancelled",
        paid_cents: annaClass.priceCents,
      });
      expect(byId.get(hold!.id)!.status).toBe("cancelled");
      // The past session stays as it was — only the name is anonymised.
      expect(byId.get(past)).toMatchObject({
        status: "completed",
        provider_name: "Removed provider",
      });
      expect(bookings.every((b) => b.provider_name === "Removed provider")).toBe(true);
      const payments = await one<{ n: number }>(
        "select count(*)::int as n from public.payments where booking_id = $1",
        [paid!.id],
      );
      expect(payments.n).toBe(1);

      const profile = await one<Record<string, unknown>>(
        "select status, user_id, display_name, slug, bio, city, photo_url, review_note from public.providers where id = $1",
        [anna.id],
      );
      expect(profile).toMatchObject({
        status: "removed",
        user_id: null,
        display_name: "Removed provider",
        bio: "",
        city: "",
        photo_url: null,
        review_note: "Fake profile",
      });
      expect(profile.slug).toMatch(/^removed-[0-9a-f]{32}$/);
      expect(
        await asAnon(db, "select 1 from public.catalog_providers where id = $1", [anna.id]),
      ).toHaveLength(0);
      const left = await one<{ services: number; rules: number; visible_reviews: number }>(
        `select
           (select count(*)::int from public.services where provider_id = $1 and active) as services,
           (select count(*)::int from public.availability_rules where provider_id = $1) as rules,
           (select count(*)::int from public.reviews where provider_id = $1 and not hidden) as visible_reviews`,
        [anna.id],
      );
      expect(left).toEqual({ services: 0, rules: 0, visible_reviews: 0 });
      expect(
        (await one<{ role: string }>("select role from public.profiles where id = $1", [OWNER]))
          .role,
      ).toBe("client");

      const log = await asUser<{ action: string; actor_id: string; data: Record<string, unknown> }>(
        db,
        ADMIN,
        "select action, actor_id, data from public.audit_log where entity_id = $1",
        [anna.id],
      );
      expect(log).toEqual([
        {
          action: "provider.remove",
          actor_id: ADMIN,
          data: {
            from: "approved",
            to: "removed",
            note: "Fake profile",
            name: "Anna Whitfield",
            cancelled_bookings: 2,
          },
        },
      ]);

      // Detached: the person can neither see nor edit the anonymised row any more.
      expect(
        await asUser(db, OWNER, "select id from public.providers where id = $1", [anna.id]),
      ).toHaveLength(0);
      await asUser(db, OWNER, "update public.providers set display_name = 'Anna' where id = $1", [
        anna.id,
      ]);
      expect(
        (
          await one<{ n: string }>("select display_name as n from public.providers where id = $1", [
            anna.id,
          ])
        ).n,
      ).toBe("Removed provider");

      // Final: no second removal, no approval back. A new application starts from scratch.
      await expect(remove(ADMIN, "again")).rejects.toThrow(/invalid_transition/);
      await expect(
        asUser(db, ADMIN, "select public.review_provider($1, 'approve')", [anna.id]),
      ).rejects.toThrow(/invalid_transition/);
      const [fresh] = await asUser<{ id: string; status: string }>(
        db,
        OWNER,
        "select id, status from public.apply_as_provider('Anna', 'Yoga', '', 'yoga', 'Bath', 'Europe/London', true, false)",
      );
      expect(fresh!.id).not.toBe(anna.id);
      expect(fresh!.status).toBe("pending");
    });
  });
});
