// Subscription plans as the server sees them. Display copy lives in lib/content/plans.ts; prices
// live in Stripe (created by scripts/stripe-setup.mts) and are found by lookup key, so no price
// ids are copied into env files. The database enforces the same rules (private.provider_plan,
// services_plan_limit trigger in supabase/migrations/20261020000000_payments.sql).

import type { BillingPeriod } from "@/lib/content/plans";

/** Active services allowed on the Free plan. */
export const FREE_SERVICE_LIMIT = 3;

export const PRO_LOOKUP_KEYS: Record<BillingPeriod, string> = {
  monthly: "slotwise_pro_monthly",
  yearly: "slotwise_pro_yearly",
};

const PRO_KEYS = new Set(Object.values(PRO_LOOKUP_KEYS));

/** Stripe statuses in which Pro features work. past_due keeps the subscription but not the perks. */
const GOOD_STANDING = new Set(["active", "trialing"]);

export type SubscriptionState = {
  plan: "free" | "pro";
  status: string;
};

/** Plan recorded for a Stripe subscription: Pro while it exists with a Pro price. */
export function planForSubscription(status: string, lookupKey: string | null): "free" | "pro" {
  const ended = status === "canceled" || status === "incomplete_expired";
  return !ended && lookupKey !== null && PRO_KEYS.has(lookupKey) ? "pro" : "free";
}

/** Plan whose limits apply now. Mirrors private.provider_plan(). */
export function effectivePlan(sub: SubscriptionState | null): "free" | "pro" {
  return sub?.plan === "pro" && GOOD_STANDING.has(sub.status) ? "pro" : "free";
}

/** Payment problem the provider must fix (banner in the dashboard). */
export function needsPaymentAttention(sub: SubscriptionState | null): boolean {
  return sub?.plan === "pro" && (sub.status === "past_due" || sub.status === "unpaid");
}
