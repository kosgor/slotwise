import type { Metadata } from "next";

import { Suspense } from "react";

import { PlanCta, PlanCtaSkeleton } from "@/components/features/pricing/plan-cta";
import { PricingPlans } from "@/components/features/pricing/pricing-plans";

export const metadata: Metadata = {
  title: "Pricing for professionals",
  description:
    "List your services on Slotwise for free. Upgrade to Pro for unlimited services, priority placement and an AI booking assistant.",
  alternates: { canonical: "/pricing" },
};

const QUESTIONS = [
  {
    q: "Do clients pay a booking fee?",
    a: "No. Clients pay only the price you set for the session.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrade or downgrade at any time; changes apply from the next billing period.",
  },
  {
    q: "What happens if a payment fails?",
    a: "You keep your profile and bookings. Pro features pause until the card is updated.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          Simple pricing for professionals
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Start free. Upgrade when the bookings start rolling in.
        </p>
      </div>
      <div className="mt-12">
        {/* The plans are static; only the buttons depend on who is looking, so they stream in. */}
        <PricingPlans
          actions={{
            free: (
              <Suspense fallback={<PlanCtaSkeleton />}>
                <PlanCta plan="free" highlighted={false} />
              </Suspense>
            ),
            pro: (
              <Suspense fallback={<PlanCtaSkeleton />}>
                <PlanCta plan="pro" highlighted />
              </Suspense>
            ),
          }}
        />
      </div>
      <section aria-labelledby="pricing-faq" className="mt-20">
        <h2 id="pricing-faq" className="text-2xl font-semibold">
          Questions about billing
        </h2>
        <dl className="mt-6 grid gap-6 md:grid-cols-3">
          {QUESTIONS.map((item) => (
            <div key={item.q}>
              <dt className="font-medium">{item.q}</dt>
              <dd className="mt-2 text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
