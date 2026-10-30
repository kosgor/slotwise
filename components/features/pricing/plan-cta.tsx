import { CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { cache } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { effectivePlan, needsPaymentAttention } from "@/lib/billing/plans";
import { getOwnSubscription } from "@/lib/billing/queries";
import { getOwnProvider } from "@/lib/provider/queries";
import { cn } from "@/lib/utils";

type Viewer =
  { kind: "visitor" } | { kind: "provider"; plan: "free" | "pro"; paymentFailed: boolean };

/** Who is looking at the pricing page; shared by both cards (one lookup per request). */
const getViewer = cache(async (): Promise<Viewer> => {
  const user = await getCurrentUser();
  if (user?.role !== "provider") return { kind: "visitor" };
  const provider = await getOwnProvider(user.id);
  if (!provider) return { kind: "visitor" };
  const subscription = await getOwnSubscription(provider.id);
  return {
    kind: "provider",
    // The plan whose limits apply now: a Pro subscription with a failed payment counts as Free.
    plan: effectivePlan(subscription),
    paymentFailed: needsPaymentAttention(subscription),
  };
});

/** A caption line and a 44px action: the same height in every state, so the cards never jump. */
function Area({
  caption,
  tone,
  children,
}: {
  caption?: string;
  tone?: "muted" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 space-y-2">
      <p
        className={cn(
          "h-5 text-center text-sm",
          tone === "destructive" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {caption}
      </p>
      {children}
    </div>
  );
}

function CurrentPlan() {
  return (
    <p className="flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed text-sm font-medium">
      <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
      Your current plan
    </p>
  );
}

function Action({
  href,
  highlighted,
  children,
}: {
  href: string;
  highlighted: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button asChild size="lg" variant={highlighted ? "default" : "outline"} className="h-11 w-full">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/**
 * The action under a plan, for whoever is looking: visitors and clients apply (Pro is bought from
 * the dashboard, so it needs a provider profile first); providers see their current plan and the
 * next step from it. Streams in after the static page (it reads the session).
 */
export async function PlanCta({
  plan,
  highlighted,
}: {
  plan: "free" | "pro";
  highlighted: boolean;
}) {
  const viewer = await getViewer();

  if (viewer.kind === "visitor") {
    return plan === "free" ? (
      <Area caption="No card needed">
        <Action href="/account/become-provider" highlighted={highlighted}>
          Start for free
        </Action>
      </Area>
    ) : (
      <Area caption="Apply first, upgrade any time">
        <Action href="/account/become-provider" highlighted={highlighted}>
          Try Pro
        </Action>
      </Area>
    );
  }

  if (plan === "free") {
    return viewer.plan === "free" ? (
      <Area>
        <CurrentPlan />
      </Area>
    ) : (
      <Area>
        <p className="flex h-11 items-center justify-center text-sm text-muted-foreground">
          Everything here is included in Pro
        </p>
      </Area>
    );
  }

  if (viewer.paymentFailed) {
    return (
      <Area caption="Your last Pro payment failed" tone="destructive">
        <Action href="/dashboard/billing" highlighted={highlighted}>
          Update payment method
        </Action>
      </Area>
    );
  }
  return viewer.plan === "pro" ? (
    <Area>
      <div className="flex h-11 items-center gap-2">
        <div className="flex-1">
          <CurrentPlan />
        </div>
        <Button asChild variant="outline" className="h-11">
          <Link href="/dashboard/billing">Manage billing</Link>
        </Button>
      </div>
    </Area>
  ) : (
    <Area caption="Your new limits apply right away">
      <Action href="/dashboard/billing" highlighted={highlighted}>
        Upgrade to Pro
      </Action>
    </Area>
  );
}

/** Same size as PlanCta, so the page does not move when the real action streams in. */
export function PlanCtaSkeleton() {
  return (
    <div className="mt-8 space-y-2" aria-hidden="true">
      <div className="h-5" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}
