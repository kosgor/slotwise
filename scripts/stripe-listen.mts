// Forwards Stripe test-mode webhooks to the local app. Uses STRIPE_SECRET_KEY from .env.local, so
// `stripe login` is optional. Run: npm run stripe:listen  (PORT=3100 to target the production build)
import { spawn } from "node:child_process";

process.loadEnvFile(".env.local");

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY in .env.local first (docs/setup-stripe.md).");
  process.exit(1);
}
const port = process.env.PORT ?? "3000";
// The events lib/stripe/webhook.ts handles (Stripe CLI 1.5x requires an explicit list).
const EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "charge.refunded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
];
const child = spawn(
  process.env.STRIPE_CLI ?? "stripe",
  ["listen", "--events", EVENTS.join(","), "--forward-to", `localhost:${port}/api/webhooks/stripe`],
  { stdio: "inherit", env: { ...process.env, STRIPE_API_KEY: key } },
);
child.on("exit", (code) => process.exit(code ?? 0));
// Stop the CLI with this script: on Windows a killed parent does not take its children along, and a
// forgotten listener keeps forwarding every event a second time.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => child.kill(signal));
}
process.on("exit", () => child.kill());
