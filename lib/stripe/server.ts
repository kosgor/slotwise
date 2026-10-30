// Stripe client for server code. Created lazily: `next build` imports this module without the
// key being needed, and a missing key fails the one request that needs it, with a clear message.
// The API version is the one this SDK release is built for (stripe@23: 2026-09-30.endive), so
// types and behaviour match.

import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set (see docs/setup-stripe.md)");
    client = new Stripe(key, { appInfo: { name: "Slotwise" } });
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Absolute URL of a page on this site, for links Stripe sends the user back to. */
export function siteUrl(path: string): string {
  return new URL(path, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();
}
