// @vitest-environment node
//
// POST /api/webhooks/stripe: only requests signed with our webhook secret reach the handler.

import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleStripeEvent = vi.fn(async () => ({ result: "confirmed", jobs: [] }));

vi.mock("server-only", () => ({}));
// The logger pulls in Sentry, a slow import that has nothing to do with signatures.
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/stripe/webhook", () => ({ handleStripeEvent }));
vi.mock("@/lib/stripe/webhook-deps", () => ({ webhookDeps: () => ({}) }));

const SECRET = "whsec_test_secret";
const payload = JSON.stringify({
  id: "evt_route_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: {} },
});

function request(body: string, signature?: string) {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: signature ? { "stripe-signature": signature } : {},
  }) as unknown as import("next/server").NextRequest;
}

const sign = (body: string, secret = SECRET) =>
  Stripe.webhooks.generateTestHeaderString({ payload: body, secret });

describe("Stripe webhook route", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    handleStripeEvent.mockClear();
  });

  it("accepts a correctly signed event", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(handleStripeEvent).toHaveBeenCalledOnce();
  });

  it.each([
    ["no signature", () => request(payload)],
    ["someone else's secret", () => request(payload, sign(payload, "whsec_attacker"))],
    [
      "a body changed after signing",
      () => request(payload.replace("evt_route_1", "evt_forged"), sign(payload)),
    ],
  ])("answers 400 and touches nothing for %s", async (_label, makeRequest) => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("answers 500 when processing fails, so Stripe retries", async () => {
    handleStripeEvent.mockRejectedValueOnce(new Error("database down"));
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(500);
  });
});
