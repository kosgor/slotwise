// @vitest-environment node
//
// Stage 5 on the real migrations: admin actions leave an audit line in the same transaction,
// nobody can rewrite the log, and only admins hide or restore reviews.

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
  asService,
  asUser,
  createTestDb,
  createUser,
  rolledBack as rolledBackIn,
} from "./db";

const ADMIN = "00000000-0000-4000-8000-0000000000e5";
const CLIENT = "00000000-0000-4000-8000-0000000000a1";
const APPLICANT = "00000000-0000-4000-8000-0000000000f6";

let db: PGlite;
let reviewId: string;
let providerId: string;
const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);

const visibleReviews = async () =>
  (await asAnon<{ id: string }>(db, "select id from public.reviews where id = $1", [reviewId]))
    .length;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ADMIN, "admin@example.com", "Admin");
  await createUser(db, CLIENT, "client@example.com", "Casey");
  await createUser(db, APPLICANT, "nina@example.com", "Nina");
  await db.exec(`update public.profiles set role = 'admin' where id = '${ADMIN}'`);
  const { rows } = await db.query<{ id: string }>(
    `select r.id from public.reviews r join public.providers p on p.id = r.provider_id
     where p.status = 'approved' and not r.hidden limit 1`,
  );
  reviewId = rows[0]!.id;
  const [p] = await asUser<{ id: string }>(
    db,
    APPLICANT,
    `select id from public.apply_as_provider('Nina', 'Piano', '', 'music', 'Lisbon', 'Europe/Lisbon', true, false)`,
  );
  providerId = p!.id;
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("moderate_review", () => {
  it("hides a review with or without a reason, removes it from the public site, and logs who did it", async () => {
    await rolledBack(async () => {
      expect(await visibleReviews()).toBe(1);
      // The reason is optional: a blank one is stored as no reason.
      await asUser(db, ADMIN, "select public.moderate_review($1, true, '  ')", [reviewId]);
      expect(await visibleReviews()).toBe(0);
      const [blank] = await asUser<{ hidden_reason: string | null }>(
        db,
        ADMIN,
        "select hidden_reason from public.reviews where id = $1",
        [reviewId],
      );
      expect(blank!.hidden_reason).toBeNull();
      await asUser(db, ADMIN, "select public.moderate_review($1, false)", [reviewId]);

      await asUser(db, ADMIN, "select public.moderate_review($1, true, 'Personal data')", [
        reviewId,
      ]);
      expect(await visibleReviews()).toBe(0);
      // The admin still sees it, with the reason.
      const [row] = await asUser<{ hidden: boolean; hidden_reason: string }>(
        db,
        ADMIN,
        "select hidden, hidden_reason from public.reviews where id = $1",
        [reviewId],
      );
      expect(row).toEqual({ hidden: true, hidden_reason: "Personal data" });

      const log = await asUser<{ actor_id: string; action: string; data: { reason: string } }>(
        db,
        ADMIN,
        "select actor_id, action, data from public.audit_log where entity = 'review' and entity_id = $1",
        [reviewId],
      );
      expect(log).toContainEqual(
        expect.objectContaining({
          actor_id: ADMIN,
          action: "review.hide",
          data: expect.objectContaining({ reason: "Personal data" }),
        }),
      );

      await asUser(db, ADMIN, "select public.moderate_review($1, false)", [reviewId]);
      expect(await visibleReviews()).toBe(1);
    });
  });

  it("is admin-only, and the hidden flag cannot be changed around the function", async () => {
    await expect(
      asUser(db, CLIENT, "select public.moderate_review($1, true, 'spam')", [reviewId]),
    ).rejects.toThrow(/not_admin/);
    await expect(
      asAnon(db, "select public.moderate_review($1, true, 'spam')", [reviewId]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ADMIN, "update public.reviews set hidden = true where id = $1", [reviewId]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("audit_log", () => {
  it("records provider reviews with the status change", async () => {
    await rolledBack(async () => {
      await asUser(db, ADMIN, "select public.review_provider($1, 'reject', 'Add a photo')", [
        providerId,
      ]);
      const [entry] = await asUser<{ action: string; data: Record<string, string> }>(
        db,
        ADMIN,
        "select action, data from public.audit_log where entity_id = $1",
        [providerId],
      );
      expect(entry).toMatchObject({
        action: "provider.reject",
        data: { from: "pending", to: "rejected", note: "Add a photo" },
      });
    });
  });

  it("a failed action leaves no log line (same transaction)", async () => {
    await rolledBack(async () => {
      await expect(
        asUser(db, ADMIN, "select public.review_provider($1, 'suspend', 'x')", [providerId]),
      ).rejects.toThrow(/invalid_transition/);
      expect(await asUser(db, ADMIN, "select * from public.audit_log")).toHaveLength(0);
    });
  });

  it("is readable only by admins and cannot be written or edited through the API", async () => {
    await rolledBack(async () => {
      await asUser(db, ADMIN, "select public.review_provider($1, 'approve')", [providerId]);
      expect(await asUser(db, CLIENT, "select * from public.audit_log")).toHaveLength(0);
      for (const user of [CLIENT, ADMIN]) {
        await expect(
          asUser(
            db,
            user,
            "insert into public.audit_log (action, entity, entity_id) values ('x.y', 'xx', '1')",
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(asUser(db, user, "update public.audit_log set data = '{}'")).rejects.toThrow(
          /permission denied/,
        );
        await expect(asUser(db, user, "delete from public.audit_log")).rejects.toThrow(
          /permission denied/,
        );
      }
      // Even the server key only appends.
      await expect(asService(db, "delete from public.audit_log")).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});
