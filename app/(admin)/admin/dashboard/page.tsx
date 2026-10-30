import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminsOnly } from "@/components/features/admin/admin-nav";
import { CollapsibleSection } from "@/components/data-view/collapsible-section";
import { DailyBarChart } from "@/components/features/admin/daily-bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdmin } from "@/lib/admin/guard";
import { computeMetrics, formatMicros } from "@/lib/admin/metrics";
import { formatPrice } from "@/lib/catalog/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin dashboard", robots: { index: false } };

const DAYS = 30;
const FEATURE_LABELS: Record<string, string> = {
  chat: "Concierge chat",
  profile_draft: "Profile drafts",
  weekly_summary: "Weekly summaries",
  document_embedding: "Document embeddings",
};

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  if (!(await getAdmin("/admin/dashboard"))) return <AdminsOnly />;

  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString();
  // RLS: admins read every booking, subscription and usage row; the queries are the same for anyone.
  const [bookings, subscriptions, aiUsage] = await Promise.all([
    supabase
      .from("bookings")
      .select("created_at, status, paid_cents, refunded_cents, currency")
      .gte("created_at", since),
    supabase.from("provider_subscriptions").select("plan, status"),
    supabase
      .from("ai_usage")
      .select("created_at, cost_micros, feature, status")
      .gte("created_at", since),
  ]);
  if (bookings.error || subscriptions.error || aiUsage.error) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
        The dashboard could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  const m = computeMetrics({
    bookings: bookings.data,
    subscriptions: subscriptions.data,
    aiUsage: aiUsage.data,
    now,
    days: DAYS,
  });
  const busiest = m.bookings.perDay.reduce((a, b) => (b.value > a.value ? b : a));
  const costliest = m.ai.perDayMicros.reduce((a, b) => (b.value > a.value ? b : a));
  const features = Object.entries(m.ai.byFeature).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Last {DAYS} days, UTC.</p>
      </div>

      {/* Business first (bookings, money), then what the AI features cost to run. */}
      <section aria-labelledby="bookings-title" className="space-y-4">
        <h2 id="bookings-title" className="text-xl font-semibold">
          Bookings and revenue
        </h2>
        <Stats
          items={[
            {
              label: "Bookings",
              value: m.bookings.total,
              hint: `${m.bookings.cancelled} cancelled`,
            },
            {
              label: "Revenue kept",
              value: formatPrice(m.revenueCents, m.currency),
              hint: "paid minus refunds",
            },
            {
              label: "Pro subscriptions",
              value: m.subscriptions.pro,
              hint: `${m.subscriptions.pastDue} past due`,
            },
          ]}
        />
        <DailyBarChart
          title="Bookings per day"
          summary={
            m.bookings.total === 0
              ? "No bookings in this period."
              : `${m.bookings.total} bookings in ${DAYS} days; the busiest day had ${busiest.value}.`
          }
          points={m.bookings.perDay}
          format={(v) => String(v)}
        />
      </section>

      {/* Closed by default: the running cost matters less day to day than bookings. */}
      <CollapsibleSection
        title="AI"
        summary={`${formatMicros(m.ai.costMicros)} spent · ${m.ai.requests} requests`}
      >
        <DailyBarChart
          title="AI spend per day"
          summary={
            m.ai.costMicros === 0
              ? "No AI spend in this period."
              : `${formatMicros(m.ai.costMicros)} in ${DAYS} days; the highest day cost ${formatMicros(costliest.value)}. Paid-tier prices; the free tier bills $0.`
          }
          points={m.ai.perDayMicros}
          format={formatMicros}
        />
        <div>
          <h3 id="ai-title" className="font-medium">
            AI spend by feature
          </h3>
          {features.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed p-6 text-center text-muted-foreground">
              No AI usage yet.
            </p>
          ) : (
            <div
              className="relative mt-3 overflow-x-auto rounded-xl border"
              tabIndex={0}
              role="region"
              aria-label="AI spend by feature"
            >
              <table className="w-full text-sm">
                <caption className="sr-only">
                  AI spend by feature, last {DAYS} days, highest first
                </caption>
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th scope="col" className="p-3 font-medium">
                      Feature
                    </th>
                    <th scope="col" className="p-3 text-right font-medium">
                      Spend
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {features.map(([feature, micros]) => (
                    <tr key={feature}>
                      <th scope="row" className="p-3 text-left font-normal">
                        {FEATURE_LABELS[feature] ?? feature}
                      </th>
                      <td className="p-3 text-right tabular-nums">{formatMicros(micros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

/** Headline numbers; three per row on wide screens, so both sections line up. */
function Stats({ items }: { items: { label: string; value: React.ReactNode; hint: string }[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border bg-card p-5">
          <dt className="text-sm text-muted-foreground">{s.label}</dt>
          <dd className="mt-1 text-2xl font-semibold">{s.value}</dd>
          <dd className="text-xs text-muted-foreground">{s.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
