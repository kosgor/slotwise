// @vitest-environment node
//
// Runs the real migration and seed in PGlite (Postgres compiled to WebAssembly) and checks the
// RLS policies as the `anon` role — the role every browser request uses in Supabase.
// Supabase-specific pieces are stubbed in ./db.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { summarizeProviders } from "@/lib/catalog/query";
import { providers, reviews, services } from "@/lib/catalog/seed-data";

import { asAnon as asAnonIn, createTestDb } from "./db";

const APPROVED = providers.filter((p) => p.status === "approved").length;
const pending = providers.find((p) => p.status === "pending")!;

let db: PGlite;
const asAnon = <T>(sql: string) => asAnonIn<T>(db, sql);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("catalog RLS as anon", () => {
  it("sees only approved providers", async () => {
    const rows = await asAnon<{ status: string; slug: string }>(
      "select status, slug from public.providers",
    );
    expect(rows.length).toBe(APPROVED);
    expect(rows.every((r) => r.status === "approved")).toBe(true);
    expect(rows.find((r) => r.slug === "zoe-coaching")).toBeUndefined();
  });

  it("does not see services or reviews of non-approved providers", async () => {
    const services = await asAnon<{ count: number }>(`
      select count(*)::int as count from public.services s
      where s.provider_id = '${pending.id}'`);
    expect(services[0]!.count).toBe(0);
  });

  it("does not see hidden reviews", async () => {
    const visible = await asAnon<{ count: number }>(
      "select count(*)::int as count from public.reviews where hidden",
    );
    expect(visible[0]!.count).toBe(0);
    const total = await db.query<{ count: number }>(
      "select count(*)::int as count from public.reviews where hidden",
    );
    expect(total.rows[0]!.count).toBe(1);
  });

  const INSERT_PROVIDER = `insert into public.providers
    (slug, display_name, headline, category, city, timezone, offers_online)
    values ('hacker-coaching', 'Hacker', 'x', 'coaching', 'London', 'UTC', true)`;

  it("layer 1 — has no write privileges at all", async () => {
    await expect(asAnon(INSERT_PROVIDER)).rejects.toThrow(/permission denied/);
    await expect(asAnon("update public.providers set status = 'suspended'")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("layer 2 — RLS still blocks writes if a write grant is ever added by mistake", async () => {
    await db.exec("grant insert, update on public.providers to anon");
    try {
      await expect(asAnon(INSERT_PROVIDER)).rejects.toThrow(/row-level security/);
      // UPDATE without a matching policy changes zero rows instead of failing.
      await asAnon("update public.providers set status = 'suspended'");
      const stillApproved = await db.query<{ count: number }>(
        "select count(*)::int as count from public.providers where status = 'approved'",
      );
      expect(stillApproved.rows[0]!.count).toBe(APPROVED);
    } finally {
      await db.exec("revoke insert, update on public.providers from anon");
    }
  });

  it("cannot read a new table that no migration granted", async () => {
    // What "Automatically expose new tables: off" buys us: a forgotten GRANT fails closed.
    await db.exec("create table public.internal_notes (id int primary key, note text)");
    try {
      await expect(asAnon("select * from public.internal_notes")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("drop table public.internal_notes");
    }
  });
});

describe("catalog_providers view", () => {
  it("is created with security_invoker, otherwise it would bypass RLS", async () => {
    // The view filters by status itself, so equal results alone would not prove the option is set.
    const { rows } = await db.query<{ reloptions: string[] | null }>(
      "select reloptions from pg_class where relname = 'catalog_providers'",
    );
    expect(rows[0]!.reloptions).toContain("security_invoker=true");
  });

  it("respects RLS through security_invoker and matches the app's aggregation", async () => {
    const rows = await asAnon<{
      slug: string;
      min_price_cents: number;
      rating_avg: string | null;
      review_count: number;
    }>(
      "select slug, min_price_cents, rating_avg, review_count from public.catalog_providers order by slug",
    );
    const expected = summarizeProviders(providers, services, reviews)
      .map((p) => ({
        slug: p.slug,
        min_price_cents: p.minPriceCents,
        rating_avg: p.ratingAvg === null ? null : p.ratingAvg.toFixed(1),
        review_count: p.reviewCount,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    expect(
      rows.map((r) => ({ ...r, rating_avg: r.rating_avg === null ? null : String(r.rating_avg) })),
    ).toEqual(expected);
  });
});

describe("constraints", () => {
  it("rejects negative prices and invalid ratings", async () => {
    await expect(
      db.exec(`insert into public.services (provider_id, title, duration_min, price_cents)
               values ('00000000-0000-4000-8000-000000000001', 'Bad', 60, -100)`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.exec(`insert into public.reviews (provider_id, author_name, rating, body)
               values ('00000000-0000-4000-8000-000000000001', 'X', 6, 'too good')`),
    ).rejects.toThrow(/check constraint/);
  });

  it("requires at least one session format", async () => {
    await expect(
      db.exec(`insert into public.providers (slug, display_name, headline, category, city, timezone)
               values ('nobody-yoga', 'Nobody', 'x', 'yoga', 'Berlin', 'Europe/Berlin')`),
    ).rejects.toThrow(/providers_offers_some_format/);
  });
});

describe("provider photo migration", () => {
  it("adds photo_url and exposes it through the view", async () => {
    const rows = await asAnon<{ slug: string; photo_url: string | null }>(
      "select slug, photo_url from public.catalog_providers where photo_url is not null order by slug",
    );
    expect(rows.map((r) => r.slug)).toEqual(["anna-yoga", "emma-coaching", "marcus-fitness"]);
  });

  it("rejects photo URLs that are neither a site path nor https", async () => {
    await expect(
      db.exec(
        "update public.providers set photo_url = 'javascript:alert(1)' where slug = 'anna-yoga'",
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("updated_at trigger", () => {
  it("still works with the pinned empty search_path", async () => {
    const before = await db.query<{ updated_at: Date }>(
      "select updated_at from public.providers where slug = 'anna-yoga'",
    );
    await db.exec("update public.providers set headline = headline where slug = 'anna-yoga'");
    const after = await db.query<{ updated_at: Date }>(
      "select updated_at from public.providers where slug = 'anna-yoga'",
    );
    expect(after.rows[0]!.updated_at.getTime()).toBeGreaterThan(
      before.rows[0]!.updated_at.getTime(),
    );
    const config = await db.query<{ proconfig: string[] | null }>(
      "select proconfig from pg_proc where proname = 'set_updated_at'",
    );
    expect(config.rows[0]!.proconfig).toContain('search_path=""');
  });
});

describe("seed", () => {
  it("re-applies over edited demo data: restores the rows, keeps accounts linked", async () => {
    const owner = "00000000-0000-4000-8000-0000000000e1";
    await db.exec(`
      insert into auth.users (id, email) values ('${owner}', 'owner@example.com');
      update public.providers set status = 'suspended', display_name = 'Edited', user_id = '${owner}'
        where slug = 'anna-yoga';
      update public.services set currency = 'USD', price_cents = 1 where provider_id = (
        select id from public.providers where slug = 'anna-yoga');
      update public.reviews set hidden = true, hidden_reason = 'Test' where not hidden;
      -- An older seed had this slug on another id: the upsert must not hit the unique constraint.
      update public.providers set slug = 'old-olivia' where slug = 'olivia-yoga';
      update public.providers set slug = 'olivia-yoga' where slug = 'hannah-yoga';`);

    await db.exec(readFileSync(join(import.meta.dirname, "../../supabase/seed.sql"), "utf8"));

    const anna = providers.find((p) => p.slug === "anna-yoga")!;
    const row = await db.query<{ status: string; display_name: string; user_id: string }>(
      "select status, display_name, user_id from public.providers where slug = 'anna-yoga'",
    );
    expect(row.rows[0]).toEqual({
      status: "approved",
      display_name: anna.displayName,
      user_id: owner,
    });
    const prices = await db.query<{ price_cents: number; currency: string }>(
      "select price_cents, currency from public.services where provider_id = $1 order by id",
      [anna.id],
    );
    expect(prices.rows).toEqual(
      services
        .filter((s) => s.providerId === anna.id)
        .map((s) => ({ price_cents: s.priceCents, currency: "GBP" })),
    );
    const hidden = await db.query<{ count: number }>(
      "select count(*)::int as count from public.reviews where hidden",
    );
    expect(hidden.rows[0]!.count).toBe(reviews.filter((r) => r.hidden).length);
    await db.exec(`update public.providers set user_id = null where slug = 'anna-yoga';
      delete from auth.users where id = '${owner}';`);
    // Re-runs the whole seed: slow when every suite runs in parallel.
  }, 30_000);
});
