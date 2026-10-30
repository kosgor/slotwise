// One-time Stripe setup for a fresh (test-mode) account: the Pro product with monthly and yearly
// prices, and a Customer Portal configuration. Idempotent — run it again and it reuses what
// exists. Prices are found by lookup key (lib/billing/plans.ts), so nothing is copied to env files.
//
// Run: npm run stripe:setup   (needs STRIPE_SECRET_KEY in .env.local)
import Stripe from "stripe";

process.loadEnvFile(".env.local");

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY in .env.local first (docs/setup-stripe.md).");
  process.exit(1);
}
if (!key.startsWith("sk_test_") && !process.argv.includes("--live")) {
  console.error("This is not a test-mode key. Pass --live if you really mean it.");
  process.exit(1);
}

const stripe = new Stripe(key);

// Keep in sync with lib/billing/plans.ts (lookup keys) and lib/content/plans.ts (amounts).
const PRICES = [
  { lookupKey: "slotwise_pro_monthly", amount: 1900, interval: "month" },
  { lookupKey: "slotwise_pro_yearly", amount: 19000, interval: "year" },
] as const;

async function findOrCreateProduct(): Promise<Stripe.Product> {
  const found = await stripe.products.search({ query: "metadata['slotwise_plan']:'pro'" });
  if (found.data[0]) return found.data[0];
  return stripe.products.create({
    name: "Slotwise Pro",
    description: "Unlimited services, priority placement and the AI booking assistant.",
    metadata: { slotwise_plan: "pro" },
  });
}

const product = await findOrCreateProduct();
console.log(`Product: ${product.id} (${product.name})`);

const priceIds: string[] = [];
for (const p of PRICES) {
  const found = await stripe.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 });
  // A price from before the switch to pounds: a new GBP price takes over its lookup key, and the
  // old one stays for subscriptions already on it (Stripe prices cannot change currency).
  const existing = found.data[0]?.currency === "gbp" ? found.data[0] : undefined;
  const price =
    existing ??
    (await stripe.prices.create({
      product: product.id,
      currency: "gbp",
      unit_amount: p.amount,
      recurring: { interval: p.interval },
      lookup_key: p.lookupKey,
      transfer_lookup_key: true,
      nickname: `Pro ${p.interval}ly`,
    }));
  priceIds.push(price.id);
  console.log(`Price ${p.lookupKey}: ${price.id}${existing ? " (existing)" : " (created)"}`);
}

// The portal needs a saved configuration before the first session can be created.
const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
  customer_update: { enabled: true, allowed_updates: ["email", "name"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    proration_behavior: "create_prorations",
    products: [{ product: product.id, prices: priceIds }],
  },
};
const business_profile = { headline: "Slotwise — manage your Pro subscription" };
if (configs.data[0]) {
  await stripe.billingPortal.configurations.update(configs.data[0].id, {
    features,
    business_profile,
  });
  console.log(`Customer Portal: ${configs.data[0].id} (updated)`);
} else {
  const config = await stripe.billingPortal.configurations.create({ features, business_profile });
  console.log(`Customer Portal: ${config.id} (created)`);
}
console.log("Done.");
