// Shared PGlite setup for RLS tests: the real migrations and seed on Postgres compiled to
// WebAssembly, plus a minimal stand-in for what Supabase provides out of the box.

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist, vector } });
  await db.exec(`
    -- Supabase installs extensions into "extensions" and keeps it on the search_path.
    create schema extensions;
    set search_path = public, extensions;

    -- Supabase Auth: users table (only the columns our code touches) and auth.uid(),
    -- which reads the user id from the request's JWT claims — like the real implementation.
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
    $$;

    -- Data API roles. Like the real project ("Automatically expose new tables" off), they get
    -- no table privileges by default: only the GRANTs written in migrations apply.
    create role anon nologin;
    create role authenticated nologin;
    -- Like Supabase: the server role bypasses RLS (BYPASSRLS), the API roles do not.
    create role service_role nologin bypassrls;
    -- Supabase Auth's own role: runs auth hooks (custom_access_token_hook).
    create role supabase_auth_admin nologin;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema extensions to anon, authenticated, service_role;

    -- Supabase Storage: buckets and objects (only the columns our policies touch), RLS on.
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets (id),
      name text not null,
      owner uuid default auth.uid()
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, delete on storage.objects to authenticated;
  `);
  for (const file of readdirSync(join(root, "supabase/migrations")).sort()) {
    await db.exec(readFileSync(join(root, "supabase/migrations", file), "utf8"));
  }
  await db.exec(readFileSync(join(root, "supabase/seed.sql"), "utf8"));
  return db;
}

let txDepth = 0;
let savepointCounter = 0;

/**
 * Runs SQL as a Data API role with the given JWT claims, like a request through Supabase's REST API.
 * Uses SET LOCAL inside its own transaction — or its own savepoint when called inside
 * rolledBack() — so a failing statement rolls back cleanly and never leaks the role to the next query.
 */
async function runAs<T>(db: PGlite, role: string, claims: string, sql: string, params: unknown[]) {
  const sp = `sp_${++savepointCounter}`;
  await db.exec(txDepth > 0 ? `savepoint ${sp}` : "begin");
  try {
    await db.query(
      "select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)",
      [role, claims],
    );
    const result = (await db.query<T>(sql, params)).rows;
    await db.exec(txDepth > 0 ? `reset role; release savepoint ${sp}` : "commit");
    return result;
  } catch (error) {
    await db.exec(txDepth > 0 ? `rollback to savepoint ${sp}; reset role` : "rollback");
    throw error;
  }
}

/** Runs SQL as the anonymous Data API role (a visitor without a session). */
export function asAnon<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs<T>(db, "anon", "", sql, params);
}

/** Runs SQL as a signed-in user: role "authenticated" with that user's id in the JWT claims. */
export function asUser<T>(
  db: PGlite,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return runAs<T>(db, "authenticated", JSON.stringify({ sub: userId }), sql, params);
}

/** Runs SQL as the server (service_role): webhooks and background jobs with the secret key. */
export function asService<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs<T>(db, "service_role", JSON.stringify({ role: "service_role" }), sql, params);
}

/** Runs SQL as Supabase Auth (supabase_auth_admin), the role that calls auth hooks. */
export function asAuthService<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs<T>(db, "supabase_auth_admin", "", sql, params);
}

/** Runs fn in a transaction that is always rolled back: the database is unchanged afterwards. */
export async function rolledBack<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  txDepth++;
  try {
    return await fn();
  } finally {
    txDepth--;
    await db.exec("rollback");
  }
}

/** Creates an auth user the way Supabase Auth would; the trigger then creates the profile. */
export async function createUser(db: PGlite, id: string, email: string, fullName = "") {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ full_name: fullName }),
  ]);
}
