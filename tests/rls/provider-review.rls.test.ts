// @vitest-environment node
//
// Provider review on the real migrations (PGlite): only admins change a provider's status, only
// allowed transitions, a reason for rejection and suspension, and the catalog follows the status.

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asUser, createTestDb, createUser, rolledBack as rolledBackIn } from "./db";

const ADMIN = "00000000-0000-4000-8000-0000000000e5";
const APPLICANT = "00000000-0000-4000-8000-0000000000f6";
const CLIENT = "00000000-0000-4000-8000-0000000000a1";

let db: PGlite;
let providerId: string;
const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);

type Row = { status: string; review_note: string | null; reviewed_at: string | null };

const review = (userId: string, decision: string, note: string | null = null) =>
  asUser<Row>(db, userId, "select * from public.review_provider($1, $2, $3)", [
    providerId,
    decision,
    note,
  ]).then((rows) => rows[0]!);

const inCatalog = async () =>
  (
    await asAnon<{ id: string }>(db, "select id from public.catalog_providers where id = $1", [
      providerId,
    ])
  ).length === 1;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ADMIN, "admin@example.com", "Admin");
  await createUser(db, APPLICANT, "nina@example.com", "Nina New");
  await createUser(db, CLIENT, "client@example.com", "Casey");
  await db.exec(`update public.profiles set role = 'admin' where id = '${ADMIN}'`);
  const [row] = await asUser<{ id: string }>(
    db,
    APPLICANT,
    `select id from public.apply_as_provider('Nina New', 'Piano for adults', '', 'music', 'Lisbon', 'Europe/Lisbon', true, false)`,
  );
  providerId = row!.id;
  // The catalog lists providers with at least one active service.
  await asUser(
    db,
    APPLICANT,
    "insert into public.services (provider_id, title, duration_min, price_cents) values ($1, 'Piano lesson', 60, 4000)",
    [providerId],
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("review_provider", () => {
  it("lets only admins change the status — not the applicant, a client or a visitor", async () => {
    await expect(review(APPLICANT, "approve")).rejects.toThrow(/not_admin/);
    await expect(review(CLIENT, "approve")).rejects.toThrow(/not_admin/);
    await expect(
      asAnon(db, "select public.review_provider($1, 'approve')", [providerId]),
    ).rejects.toThrow(/permission denied/);
    // And not around the function: status has no UPDATE grant.
    await expect(
      asUser(db, APPLICANT, "update public.providers set status = 'approved' where id = $1", [
        providerId,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("approves a pending application, which puts it in the public catalog", async () => {
    await rolledBack(async () => {
      expect(await inCatalog()).toBe(false);
      const row = await review(ADMIN, "approve");
      expect(row.status).toBe("approved");
      expect(row.reviewed_at).not.toBeNull();
      expect(await inCatalog()).toBe(true);
    });
  });

  it("rejects only with a reason, which the provider can read", async () => {
    await rolledBack(async () => {
      await expect(review(ADMIN, "reject", "  ")).rejects.toThrow(/note_required/);
      await review(ADMIN, "reject", "Please add a description of your lessons.");
      const [own] = await asUser<Row>(
        db,
        APPLICANT,
        "select status, review_note from public.providers where id = $1",
        [providerId],
      );
      expect(own).toMatchObject({
        status: "rejected",
        review_note: "Please add a description of your lessons.",
      });
      // Fixed and approved later: the old reason disappears.
      const approved = await review(ADMIN, "approve");
      expect(approved.review_note).toBeNull();
    });
  });

  it("suspends an approved profile (hidden from the catalog) and reinstates it", async () => {
    await rolledBack(async () => {
      await review(ADMIN, "approve");
      // A reason is optional when suspending (required only for rejecting an application).
      expect((await review(ADMIN, "suspend")).review_note).toBeNull();
      await review(ADMIN, "approve");
      await review(ADMIN, "suspend", "Complaints from clients.");
      expect(await inCatalog()).toBe(false);
      await review(ADMIN, "approve");
      expect(await inCatalog()).toBe(true);
    });
  });

  it("refuses transitions that make no sense", async () => {
    await rolledBack(async () => {
      await expect(review(ADMIN, "suspend", "x")).rejects.toThrow(/invalid_transition/); // pending
      await review(ADMIN, "approve");
      await expect(review(ADMIN, "approve")).rejects.toThrow(/invalid_transition/);
      await expect(review(ADMIN, "reject", "x")).rejects.toThrow(/invalid_transition/);
      await expect(review(ADMIN, "delete")).rejects.toThrow(/invalid_transition/);
    });
  });
});
