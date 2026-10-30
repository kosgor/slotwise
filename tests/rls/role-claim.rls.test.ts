// @vitest-environment node
//
// custom_access_token_hook (migration 20261028000000_role_claim.sql): puts the profile role into
// the access token for proxy.ts. Only Supabase Auth may call it.

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asAnon, asAuthService, asUser, createTestDb, createUser } from "./db";

const CLIENT = "00000000-0000-4000-8000-0000000000c1";
const ADMIN = "00000000-0000-4000-8000-0000000000c2";

let db: PGlite;

const hook = (userId: string) =>
  JSON.stringify({ user_id: userId, claims: { sub: userId, role: "authenticated" } });

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, CLIENT, "client@example.com");
  await createUser(db, ADMIN, "admin@example.com");
  await db.exec(`update public.profiles set role = 'admin' where id = '${ADMIN}'`);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("custom_access_token_hook", () => {
  it("adds the profile role as user_role and keeps the other claims", async () => {
    const run = async (userId: string) =>
      (
        await asAuthService<{ e: { claims: Record<string, string> } }>(
          db,
          "select public.custom_access_token_hook($1::jsonb) as e",
          [hook(userId)],
        )
      )[0]!.e.claims;
    expect(await run(ADMIN)).toEqual({ sub: ADMIN, role: "authenticated", user_role: "admin" });
    expect((await run(CLIENT)).user_role).toBe("client");
    // No profile (yet): the default role, never a missing claim.
    expect((await run("00000000-0000-4000-8000-0000000000c9")).user_role).toBe("client");
  });

  it("cannot be called through the Data API", async () => {
    const sql = "select public.custom_access_token_hook($1::jsonb)";
    await expect(asUser(db, CLIENT, sql, [hook(ADMIN)])).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, sql, [hook(ADMIN)])).rejects.toThrow(/permission denied/);
  });
});
