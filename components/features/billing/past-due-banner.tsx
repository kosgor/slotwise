import { CircleAlertIcon } from "lucide-react";
import Link from "next/link";

import { needsPaymentAttention } from "@/lib/billing/plans";
import { getOwnSubscription } from "@/lib/billing/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getOwnProvider } from "@/lib/provider/queries";

/**
 * Shown on every dashboard page while a Pro payment has failed. role="alert" announces it once
 * when the page loads; the text says what happened and the link says what to do — not only a red
 * colour.
 */
export async function PastDueBanner() {
  const user = await getCurrentUser();
  if (!user) return null;
  const provider = await getOwnProvider(user.id);
  if (!provider) return null;
  const subscription = await getOwnSubscription(provider.id);
  if (!needsPaymentAttention(subscription)) return null;

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex gap-2">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span>
          <strong>Your Pro payment failed.</strong> Pro features are paused until you update your
          card.
        </span>
      </p>
      <Link
        href="/dashboard/billing"
        className="shrink-0 font-medium underline underline-offset-4 hover:no-underline"
      >
        Fix payment
      </Link>
    </div>
  );
}
