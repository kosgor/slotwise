"use client";

import { CheckIcon } from "lucide-react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatPrice } from "@/lib/catalog/format";
import { PLANS, YEARLY_DISCOUNT_LABEL, type BillingPeriod, type Plan } from "@/lib/content/plans";
import { cn } from "@/lib/utils";

function monthlyEquivalent(plan: Plan, period: BillingPeriod) {
  return period === "yearly" ? Math.round(plan.priceCents.yearly / 12) : plan.priceCents.monthly;
}

/**
 * The plan cards. `actions` is the button area under each plan, rendered by the page for the
 * current viewer (components/features/pricing/plan-cta.tsx); this component stays static.
 */
export function PricingPlans({ actions }: { actions: Record<Plan["id"], React.ReactNode> }) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const switchId = useId();

  // Motion is scoped to this component: the only state-driven animation on the site, so other
  // pages do not load the library. reducedMotion="user" respects the OS setting.
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <div>
          <div className="flex items-center justify-center gap-3">
            {/* Visual label only: the switch has one accessible name, "Yearly billing". */}
            <span aria-hidden="true" className="text-sm font-medium">
              Monthly
            </span>
            {/* Radix Switch: role="switch", aria-checked and Space/Enter handling built in. */}
            <Switch
              id={switchId}
              checked={period === "yearly"}
              onCheckedChange={(checked) => setPeriod(checked ? "yearly" : "monthly")}
              aria-label="Yearly billing"
              aria-describedby={`${switchId}-hint`}
            />
            <Label htmlFor={switchId} className="text-sm" aria-hidden="true">
              Yearly
            </Label>
            <Badge id={`${switchId}-hint`} variant="secondary">
              {YEARLY_DISCOUNT_LABEL}
            </Badge>
          </div>
          <p role="status" className="sr-only">
            {period === "yearly" ? "Showing yearly prices" : "Showing monthly prices"}
          </p>

          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {PLANS.map((plan) => {
              const price = monthlyEquivalent(plan, period);
              return (
                <li
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-card p-8",
                    plan.highlighted && "border-primary shadow-lg ring-1 ring-primary",
                  )}
                >
                  {plan.highlighted && (
                    <Badge className="absolute -top-3 left-8">Most popular</Badge>
                  )}
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-muted-foreground">{plan.description}</p>

                  <div className="mt-6 flex h-12 items-baseline gap-1">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <m.span
                        key={`${plan.id}-${period}`}
                        className="text-4xl font-semibold tracking-tight"
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.2 }}
                      >
                        {formatPrice(price)}
                      </m.span>
                    </AnimatePresence>
                    <span className="text-muted-foreground">/ month</span>
                  </div>
                  <p className="h-5 text-sm text-muted-foreground">
                    {plan.priceCents.monthly === 0
                      ? "Free forever"
                      : period === "yearly"
                        ? `${formatPrice(plan.priceCents.yearly)} billed yearly`
                        : "Billed monthly, cancel anytime"}
                  </p>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <CheckIcon
                          className="mt-0.5 size-5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {actions[plan.id]}
                </li>
              );
            })}
          </ul>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
