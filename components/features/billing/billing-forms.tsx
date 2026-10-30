"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  openBillingPortal,
  startProCheckout,
  type BillingActionState,
} from "@/lib/billing/actions";
import { formatPrice } from "@/lib/catalog/format";
import { PLANS, YEARLY_DISCOUNT_LABEL } from "@/lib/content/plans";

const IDLE: BillingActionState = { status: "idle" };
const pro = PLANS.find((p) => p.id === "pro")!;

/** Choose monthly or yearly and go to Stripe Checkout. Native radios: arrow keys work. */
export function UpgradeForm() {
  const [state, action, pending] = useActionState(startProCheckout, IDLE);
  return (
    <form action={action} className="space-y-4">
      <fieldset className="min-w-0">
        <legend className="text-sm font-medium">Billing period</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["monthly", `${formatPrice(pro.priceCents.monthly)} / month`, "Cancel anytime"],
              ["yearly", `${formatPrice(pro.priceCents.yearly)} / year`, YEARLY_DISCOUNT_LABEL],
            ] as const
          ).map(([value, price, hint]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:ring-1 has-checked:ring-primary"
            >
              <input
                type="radio"
                name="period"
                value={value}
                defaultChecked={value === "monthly"}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block font-medium">{price}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending} pendingLabel="Opening payment…">
        Upgrade to Pro
      </SubmitButton>
    </form>
  );
}

export function PortalButton({ label = "Manage billing" }: { label?: string }) {
  const [state, action, pending] = useActionState(openBillingPortal, IDLE);
  return (
    <form action={action} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending} pendingLabel="Opening…" variant="outline">
        {label}
      </SubmitButton>
    </form>
  );
}

const REFRESH_MS = 2000;
const GIVE_UP_MS = 30_000;

/**
 * Back from Stripe Checkout before the webhook has arrived: re-render the page from the server
 * every 2 seconds until the plan changes (the parent stops rendering this), for up to 30 seconds.
 */
export function CheckoutPending() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    const stop = setTimeout(() => {
      clearInterval(refresh);
      setTimedOut(true);
    }, GIVE_UP_MS);
    return () => {
      clearInterval(refresh);
      clearTimeout(stop);
    };
  }, [router]);

  return (
    <div role="status" className="flex gap-2 rounded-lg border p-4 text-sm">
      {!timedOut && (
        <Loader2Icon
          className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      <p>
        {timedOut
          ? "Stripe is still confirming your payment. Pro will switch on automatically — refresh this page in a minute."
          : "Payment received. Switching on Pro…"}
      </p>
    </div>
  );
}
