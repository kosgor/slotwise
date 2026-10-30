import { CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import {
  CheckoutPending,
  PortalButton,
  UpgradeForm,
} from "@/components/features/billing/billing-forms";
import { NoProviderProfile } from "@/components/features/dashboard/no-provider";
import { FlashToast } from "@/components/forms/toasts";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { effectivePlan, FREE_SERVICE_LIMIT, needsPaymentAttention } from "@/lib/billing/plans";
import { getOwnSubscription } from "@/lib/billing/queries";
import { PLANS } from "@/lib/content/plans";
import { formatDayLong } from "@/lib/datetime";
import { getProviderContext } from "@/lib/provider/context";
import { getOwnServices } from "@/lib/provider/queries";

export const metadata: Metadata = { title: "Billing", robots: { index: false } };

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment failed",
  unpaid: "Unpaid",
  canceled: "Cancelled",
  incomplete: "Awaiting payment",
  paused: "Paused",
};

export default function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Billing searchParams={searchParams} />
    </Suspense>
  );
}

async function Billing({ searchParams }: Pick<PageProps<"/dashboard/billing">, "searchParams">) {
  const params = await searchParams;
  const { provider } = await getProviderContext("/dashboard/billing");
  if (!provider) return <NoProviderProfile />;
  const [subscription, services] = await Promise.all([
    getOwnSubscription(provider.id),
    getOwnServices(provider.id),
  ]);

  const plan = effectivePlan(subscription);
  const hasSubscription =
    Boolean(subscription?.stripe_subscription_id) && subscription?.status !== "canceled";
  const activeServices = services.filter((s) => s.active).length;
  const justPaid = params.checkout === "success";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const pro = PLANS.find((p) => p.id === "pro")!;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Payments are handled by Stripe. We never see or store card numbers.
        </p>
      </div>

      {justPaid && plan === "free" && <CheckoutPending />}
      {justPaid && plan === "pro" && (
        <FlashToast
          message="Welcome to Pro! Your new limits apply right away."
          params={["checkout"]}
        />
      )}

      <section aria-labelledby="current-plan" className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="current-plan" className="text-lg font-semibold">
            Current plan: {plan === "pro" ? "Pro" : "Free"}
          </h2>
          {subscription && subscription.status !== "none" && (
            <Badge variant={needsPaymentAttention(subscription) ? "destructive" : "secondary"}>
              {STATUS_LABEL[subscription.status] ?? subscription.status}
            </Badge>
          )}
        </div>

        {needsPaymentAttention(subscription) && (
          <p className="mt-2 text-sm">
            Your last payment failed, so Pro features are paused and Free limits apply. Update your
            card to switch them back on.
          </p>
        )}
        {periodEnd && hasSubscription && (
          <p className="mt-2 text-sm text-muted-foreground">
            {subscription?.cancel_at_period_end
              ? `Pro ends on ${formatDayLong(periodEnd, provider.timezone)}; you will not be charged again.`
              : `Renews on ${formatDayLong(periodEnd, provider.timezone)}.`}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Active services: {activeServices}
          {plan === "free" ? ` of ${FREE_SERVICE_LIMIT} on the Free plan` : " (unlimited on Pro)"}
        </p>

        {hasSubscription && (
          <div className="mt-6">
            <PortalButton
              label={
                needsPaymentAttention(subscription) ? "Update payment method" : "Manage billing"
              }
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Change card, switch between monthly and yearly, cancel or download invoices on
              Stripe&apos;s secure page.
            </p>
          </div>
        )}
      </section>

      {!hasSubscription && (
        <section aria-labelledby="upgrade" className="rounded-2xl border bg-card p-6">
          <h2 id="upgrade" className="text-lg font-semibold">
            Upgrade to Pro
          </h2>
          <ul className="mt-4 space-y-2">
            {pro.features.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <UpgradeForm />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Test mode: use card 4242 4242 4242 4242, any future date and any CVC.
          </p>
        </section>
      )}
    </div>
  );
}
