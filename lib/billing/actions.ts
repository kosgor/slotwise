"use server";

// Subscription Server Actions. They only send the provider to Stripe-hosted pages (Checkout to
// subscribe, Customer Portal to change card, switch or cancel). The plan itself changes in our
// database only when Stripe's webhook says so.

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { log } from "@/lib/log";
import { getOwnProvider } from "@/lib/provider/queries";
import { dbTagMetadata } from "@/lib/stripe/db-tag";
import { isStripeConfigured, siteUrl, stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { PRO_LOOKUP_KEYS } from "./plans";

export type BillingActionState = { status: "idle" | "error"; message?: string };

const NOT_CONFIGURED: BillingActionState = {
  status: "error",
  message: "Billing is not set up yet. Please try again later.",
};

async function requireProvider() {
  const user = await getCurrentUser();
  if (!user) return null;
  const provider = await getOwnProvider(user.id);
  return provider ? { user, provider } : null;
}

/**
 * The provider's Stripe customer id, created on first use. The row is written with the service
 * role: providers can read their subscription but never write it.
 */
async function ensureCustomer(providerId: string, email: string, name: string): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("provider_subscriptions")
    .select("stripe_customer_id")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (existing) return existing.stripe_customer_id;

  const customer = await stripe().customers.create(
    { email, name, metadata: { provider_id: providerId } },
    // Two quick clicks create one customer, not two.
    { idempotencyKey: `customer:${providerId}` },
  );
  const { error } = await admin
    .from("provider_subscriptions")
    .upsert(
      { provider_id: providerId, stripe_customer_id: customer.id },
      { onConflict: "provider_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Saving the Stripe customer: ${error.message}`);
  return customer.id;
}

export async function startProCheckout(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const own = await requireProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  if (!isStripeConfigured()) return NOT_CONFIGURED;
  const period = z.enum(["monthly", "yearly"]).catch("monthly").parse(formData.get("period"));

  let url: string | null;
  try {
    const customer = await ensureCustomer(
      own.provider.id,
      own.user.email,
      own.provider.display_name,
    );
    const prices = await stripe().prices.list({
      lookup_keys: [PRO_LOOKUP_KEYS[period]],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) {
      log.error("billing.pro_price_missing");
      return NOT_CONFIGURED;
    }
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      // The webhook maps the subscription back to the provider by this id.
      subscription_data: { metadata: { provider_id: own.provider.id, ...dbTagMetadata() } },
      metadata: { provider_id: own.provider.id, ...dbTagMetadata() },
      success_url: siteUrl("/dashboard/billing?checkout=success"),
      cancel_url: siteUrl("/dashboard/billing"),
    });
    url = session.url;
  } catch (e) {
    log.error("billing.checkout_failed", e);
    return { status: "error", message: "We could not open the payment page. Please try again." };
  }
  if (!url) return NOT_CONFIGURED;
  redirect(url);
}

/** Stripe Customer Portal: update the card, switch monthly/yearly, cancel, download invoices. */
export async function openBillingPortal(): Promise<BillingActionState> {
  const own = await requireProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  if (!isStripeConfigured()) return NOT_CONFIGURED;

  let url: string;
  try {
    const customer = await ensureCustomer(
      own.provider.id,
      own.user.email,
      own.provider.display_name,
    );
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: siteUrl("/dashboard/billing"),
    });
    url = session.url;
  } catch (e) {
    log.error("billing.portal_failed", e);
    return { status: "error", message: "We could not open billing settings. Please try again." };
  }
  redirect(url);
}
