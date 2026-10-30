import { describe, expect, it } from "vitest";

import { computeMetrics, formatMicros } from "@/lib/admin/metrics";

const NOW = new Date("2026-10-25T12:00:00Z");
const booking = (created_at: string, status = "confirmed", paid = 5000, refunded = 0) => ({
  created_at,
  status,
  paid_cents: paid,
  refunded_cents: refunded,
  currency: "GBP",
});

describe("computeMetrics", () => {
  const m = computeMetrics({
    bookings: [
      booking("2026-10-25T09:00:00Z"),
      booking("2026-10-25T10:00:00Z", "cancelled", 5000, 5000),
      booking("2026-10-20T10:00:00Z", "completed"),
      booking("2026-10-24T10:00:00Z", "expired", 0),
      booking("2026-09-01T10:00:00Z"), // outside 30 days
    ],
    subscriptions: [
      { plan: "pro", status: "active" },
      { plan: "pro", status: "past_due" },
      { plan: "free", status: "none" },
    ],
    aiUsage: [
      {
        created_at: "2026-10-25T08:00:00Z",
        cost_micros: 1200,
        feature: "chat",
        status: "finished",
      },
      {
        created_at: "2026-10-24T08:00:00Z",
        cost_micros: 300,
        feature: "document_embedding",
        status: "finished",
      },
    ],
    now: NOW,
    days: 30,
  });

  it("counts bookings in the period without expired holds", () => {
    expect(m.bookings).toMatchObject({ total: 3, confirmed: 2, cancelled: 1 });
    expect(m.bookings.perDay).toHaveLength(30);
    expect(m.bookings.perDay.at(-1)).toEqual({ date: "2026-10-25", value: 2 });
  });

  it("revenue is money kept: paid minus refunded", () => {
    expect(m.revenueCents).toBe(10_000);
  });

  it("Pro counts only subscriptions in good standing", () => {
    expect(m.subscriptions).toEqual({ pro: 1, pastDue: 1 });
  });

  it("AI spend includes embeddings; request count does not", () => {
    expect(m.ai.costMicros).toBe(1500);
    expect(m.ai.requests).toBe(1);
    expect(m.ai.byFeature).toEqual({ chat: 1200, document_embedding: 300 });
  });
});

describe("formatMicros", () => {
  it("shows fractions of a cent for small sums and cents from a dollar up", () => {
    expect(formatMicros(1500)).toBe("$0.0015");
    expect(formatMicros(12_345_678)).toBe("$12.35");
  });
});
