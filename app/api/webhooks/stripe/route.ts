// POST /api/webhooks/stripe — Stripe tells us about payments, refunds and subscriptions.
//
// 1. Verify the signature on the RAW body (any re-serialised JSON would change the bytes and fail
//    the check). No valid signature → 400 and nothing is touched.
// 2. Apply the event (lib/stripe/webhook.ts): one database transaction, then queue slow work.
// 3. Answer quickly. 2xx = done; 5xx = Stripe retries with backoff for up to three days, which is
//    safe because every effect is idempotent.

import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";

import { log } from "@/lib/log";
import { handleStripeEvent } from "@/lib/stripe/webhook";
import { webhookDeps } from "@/lib/stripe/webhook-deps";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    log.error("stripe.webhook_secret_missing");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    // Static helper: checking a signature needs only the webhook secret, not an API key.
    event = Stripe.webhooks.constructEvent(
      body,
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const { result } = await handleStripeEvent(event, webhookDeps());
    log.info("stripe.webhook", { type: event.type, eventId: event.id, result });
    return NextResponse.json({ received: true, result });
  } catch (error) {
    log.error("stripe.webhook_failed", error, { type: event.type, eventId: event.id });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
