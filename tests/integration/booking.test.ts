// Real Supabase, real concurrency: the guarantees that a single-connection PGlite test cannot show.
// Also failure drill "Чужие данные": user B asks the REST API for user A's booking.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nextLocalDates, getAvailableSlots, localDayRange } from "@/lib/booking/slots";
import { loadProviderDetails, loadSchedule } from "@/lib/catalog/source";

import {
  anonClient,
  createTestUser,
  deleteTestUsers,
  hasSecretKey,
  type TestUser,
} from "./supabase";

describe.skipIf(!hasSecretKey)("bookings on the real database", () => {
  const users: TestUser[] = [];
  let alice: TestUser;
  let bob: TestUser;
  let serviceId: string;
  let slot: string;

  beforeAll(async () => {
    alice = await createTestUser("alice");
    bob = await createTestUser("bob");
    users.push(alice, bob);

    // A free slot ~7 weeks ahead for Marcus (not linked to a demo account), computed with the same
    // code the booking page uses.
    const marcus = (await loadProviderDetails("marcus-fitness"))!;
    serviceId = marcus.services.find((s) => s.durationMin === 60)!.id;
    const schedule = await loadSchedule(marcus.id);
    const now = new Date();
    const candidates = nextLocalDates(marcus.timezone, now, 58).slice(45);
    for (const date of candidates) {
      const { from, to } = localDayRange(date, marcus.timezone);
      const busy = await anonClient().rpc("provider_busy_intervals", {
        p_provider_id: marcus.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      const free = getAvailableSlots({
        ...schedule,
        busy: (busy.data ?? []).map((b) => ({
          startsAt: new Date(b.starts_at),
          endsAt: new Date(b.ends_at),
        })),
        durationMin: 60,
        timeZone: marcus.timezone,
        from,
        to,
        now,
      });
      if (free.length > 0) {
        slot = free[0]!.toISOString();
        break;
      }
    }
    expect(slot, "no free slot found for the test").toBeTruthy();
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("two simultaneous requests for one slot: exactly one booking, the other gets slot_taken", async () => {
    const results = await Promise.all(
      [alice, bob].map((u) =>
        u.client.rpc("book_slot", { p_service_id: serviceId, p_starts_at: slot }),
      ),
    );
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error!.message).toBe("slot_taken");
  });

  it("a user cannot read someone else's booking through the API", async () => {
    const own = await alice.client.from("bookings").select("id, client_id");
    const bobs = await bob.client.from("bookings").select("id, client_id");
    const all = [...(own.data ?? []), ...(bobs.data ?? [])];
    expect(all).toHaveLength(1);
    // Each user sees only their own rows.
    expect((own.data ?? []).every((b) => b.client_id === alice.id)).toBe(true);
    expect((bobs.data ?? []).every((b) => b.client_id === bob.id)).toBe(true);
    // Asking for the other booking by id returns nothing, not an error that confirms it exists.
    const bookingId = all[0]!.id;
    const stranger = all[0]!.client_id === alice.id ? bob : alice;
    const direct = await stranger.client.from("bookings").select("*").eq("id", bookingId);
    expect(direct.data).toEqual([]);
  });

  it("visitors without a session cannot read bookings at all", async () => {
    const { data, error } = await anonClient().from("bookings").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501"); // permission denied: no GRANT for anon
  });

  it("a client cannot set their own price or status by writing to the table", async () => {
    const { error } = await alice.client
      .from("bookings")
      .update({ price_cents: 0 })
      .eq("client_id", alice.id);
    expect(error?.code).toBe("42501");
  });
});
