// @vitest-environment node
//
// Failure drill "migration on live data" (docs/operations.md): adding a required column to a table
// that already has rows. The naive version fails; the expand → backfill → contract version keeps
// every row. Runs on the real migrations and seed, rolled back afterwards.

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, rolledBack as rolledBackIn } from "./db";

let db: PGlite;
const rolledBack = <T>(fn: () => Promise<T>) => rolledBackIn(db, fn);
const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0]!.n);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("required column on a table with data", () => {
  it("the naive migration fails on existing rows", async () => {
    await rolledBack(async () => {
      expect(await count("select count(*)::int as n from public.reviews")).toBeGreaterThan(0);
      await expect(
        db.exec("alter table public.reviews add column language text not null"),
      ).rejects.toThrow(/contains null values/);
    });
  });

  it("expand → backfill → contract keeps every row and enforces the rule afterwards", async () => {
    await rolledBack(async () => {
      const before = await count("select count(*)::int as n from public.reviews");
      await db.exec(`
        -- 1. Expand: nullable, so old code and old rows keep working.
        alter table public.reviews add column language text;
        -- 2. Backfill: a value for every existing row (in production: in batches).
        update public.reviews set language = 'en' where language is null;
        -- 3. Contract: only now make it required, with a default for new rows.
        alter table public.reviews alter column language set default 'en';
        alter table public.reviews alter column language set not null;
      `);
      expect(await count("select count(*)::int as n from public.reviews")).toBe(before);
      expect(
        await count("select count(*)::int as n from public.reviews where language is null"),
      ).toBe(0);
      await expect(db.exec("update public.reviews set language = null where true")).rejects.toThrow(
        /not-null/,
      );
    });
  });
});
