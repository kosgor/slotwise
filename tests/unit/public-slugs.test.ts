import { beforeEach, describe, expect, it } from "vitest";

import { isPublicProviderSlug as check, resetPublicSlugCache } from "@/lib/catalog/public-slugs";

import { seedSummaries } from "./fixtures";

const isPublicProviderSlug = (slug: string) => check(slug, Date.now(), async () => seedSummaries());

beforeEach(() => resetPublicSlugCache());

describe("isPublicProviderSlug", () => {
  it("accepts approved providers", async () => {
    expect(await isPublicProviderSlug("anna-yoga")).toBe(true);
  });

  it("rejects pending, suspended and unknown providers", async () => {
    expect(await isPublicProviderSlug("pending-coaching")).toBe(false);
    expect(await isPublicProviderSlug("suspended-fitness")).toBe(false);
    expect(await isPublicProviderSlug("nobody-yoga")).toBe(false);
  });

  it("finds a provider approved after the list was loaded, without a query per junk URL", async () => {
    let approved = ["anna-yoga"];
    let loads = 0;
    const load = async () => {
      loads++;
      return approved.map((slug) => ({ slug }));
    };
    const t0 = 1_000_000;
    expect(await check("anna-yoga", t0, load)).toBe(true);
    approved = ["anna-yoga", "nina-music"]; // an admin approves Nina
    // Within a few seconds unknown slugs reuse the list (junk URLs cannot hammer the database)…
    expect(await check("nina-music", t0 + 1_000, load)).toBe(false);
    expect(await check("random-junk", t0 + 2_000, load)).toBe(false);
    expect(loads).toBe(1);
    // …after that, an unknown slug reloads it once: Nina is reachable long before the 60 s TTL.
    expect(await check("nina-music", t0 + 6_000, load)).toBe(true);
    expect(loads).toBe(2);
    // Known slugs never trigger a reload before the TTL.
    expect(await check("anna-yoga", t0 + 30_000, load)).toBe(true);
    expect(loads).toBe(2);
  });

  it("rejects malformed slugs without loading data", async () => {
    for (const slug of ["", "Anna-Yoga", "anna--yoga", "../etc", "a".repeat(81)]) {
      expect(await isPublicProviderSlug(slug)).toBe(false);
    }
  });
});
