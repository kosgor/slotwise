// Numbers for the admin dashboard. Pure function over rows the admin can read (RLS), tested in
// tests/unit/admin-metrics.test.ts.

const DAY = 86_400_000;

export type MetricsInput = {
  bookings: {
    created_at: string;
    status: string;
    paid_cents: number;
    refunded_cents: number;
    currency: string;
  }[];
  subscriptions: { plan: string; status: string }[];
  aiUsage: { created_at: string; cost_micros: number; feature: string; status: string }[];
  now: Date;
  days: number;
};

export type DayPoint = { date: string; value: number };

export type Metrics = {
  bookings: { total: number; confirmed: number; cancelled: number; perDay: DayPoint[] };
  revenueCents: number;
  currency: string;
  subscriptions: { pro: number; pastDue: number };
  ai: {
    requests: number;
    costMicros: number;
    perDayMicros: DayPoint[];
    byFeature: Record<string, number>;
  };
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** One point per UTC day, oldest first, ending today. */
function emptyDays(now: Date, days: number): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(dayKey(new Date(now.getTime() - i * DAY)), 0);
  return map;
}

export function computeMetrics({
  bookings,
  subscriptions,
  aiUsage,
  now,
  days,
}: MetricsInput): Metrics {
  const since = now.getTime() - days * DAY;
  const inRange = (iso: string) => new Date(iso).getTime() >= since;

  const recent = bookings.filter((b) => inRange(b.created_at));
  // Unpaid holds that ran out are noise, not bookings.
  const real = recent.filter((b) => b.status !== "expired" && b.status !== "pending_payment");
  const perDay = emptyDays(now, days);
  for (const b of real) {
    const k = b.created_at.slice(0, 10);
    if (perDay.has(k)) perDay.set(k, perDay.get(k)! + 1);
  }

  const ai = aiUsage.filter((u) => inRange(u.created_at));
  const aiPerDay = emptyDays(now, days);
  const byFeature: Record<string, number> = {};
  for (const u of ai) {
    const k = u.created_at.slice(0, 10);
    if (aiPerDay.has(k)) aiPerDay.set(k, aiPerDay.get(k)! + u.cost_micros);
    byFeature[u.feature] = (byFeature[u.feature] ?? 0) + u.cost_micros;
  }

  const toPoints = (m: Map<string, number>) => [...m].map(([date, value]) => ({ date, value }));

  return {
    bookings: {
      total: real.length,
      confirmed: real.filter((b) => b.status === "confirmed" || b.status === "completed").length,
      cancelled: real.filter((b) => b.status === "cancelled").length,
      perDay: toPoints(perDay),
    },
    revenueCents: recent.reduce((sum, b) => sum + b.paid_cents - b.refunded_cents, 0),
    currency: recent[0]?.currency ?? "GBP",
    subscriptions: {
      pro: subscriptions.filter(
        (s) => s.plan === "pro" && ["active", "trialing"].includes(s.status),
      ).length,
      pastDue: subscriptions.filter((s) => s.status === "past_due").length,
    },
    ai: {
      requests: ai.filter((u) => u.feature !== "document_embedding").length,
      costMicros: ai.reduce((sum, u) => sum + u.cost_micros, 0),
      perDayMicros: toPoints(aiPerDay),
      byFeature,
    },
  };
}

/** "$0.0123" for small AI costs, "$12.34" from a dollar up. */
export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  return dollars < 1 ? `$${dollars.toFixed(4)}` : `$${dollars.toFixed(2)}`;
}
