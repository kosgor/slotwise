import { CircleCheckIcon, CircleIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CollapsibleSection } from "@/components/data-view/collapsible-section";
import { BookingCard } from "@/components/features/booking/booking-card";
import { NoProviderProfile } from "@/components/features/dashboard/no-provider";
import { WeeklySummaryCard } from "@/components/features/provider/ai-assist";
import { FlashToast } from "@/components/forms/toasts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isAiConfigured } from "@/lib/ai/models";
import { listProviderBookings } from "@/lib/booking/queries";
import { getProviderContext } from "@/lib/provider/context";
import { getOwnSchedule, getOwnServices } from "@/lib/provider/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const params = await searchParams;
  const { provider } = await getProviderContext("/dashboard");
  if (!provider) return <NoProviderProfile />;

  const now = new Date();
  const [bookings, services, schedule] = await Promise.all([
    listProviderBookings(provider.id, { from: now, to: new Date(now.getTime() + 60 * 86_400_000) }),
    getOwnServices(provider.id),
    getOwnSchedule(provider.id),
  ]);
  const upcoming = bookings.filter((b) => b.status === "confirmed");
  const activeServices = services.filter((s) => s.active).length;

  // What stands between the provider and their first booking. Shown until all of it is done.
  const steps = [
    {
      done: activeServices > 0,
      label: "Add a service",
      hint: "What clients book: title, length and price.",
      href: "/dashboard/services",
    },
    {
      done: schedule.rules.length > 0,
      label: "Set your weekly hours",
      hint: "Clients only see free times inside them.",
      href: "/dashboard/schedule",
    },
    {
      done: provider.bio.trim().length >= 80,
      label: "Tell clients about yourself",
      hint: "A few sentences on your experience and how a session goes.",
      href: "/dashboard/profile",
    },
    {
      done: provider.status === "approved",
      label: "Get approved",
      hint: "We review every profile before it appears in the catalog.",
      href: null,
    },
  ];
  const doneSteps = steps.filter((step) => step.done).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Hello, {provider.display_name}</h1>
          <p className="mt-1 text-muted-foreground">{provider.headline}</p>
        </div>
        {provider.status === "approved" && (
          <Button asChild variant="outline">
            <Link href={`/pros/${provider.slug}`}>
              View public profile
              <ExternalLinkIcon aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>

      {params.applied === "1" && (
        <FlashToast
          params={["applied"]}
          message="Application sent. Set up your services and hours while we review it."
        />
      )}
      {provider.status === "pending" && (
        <div role="status" className="rounded-xl border border-warning bg-warning/20 p-4 text-sm">
          <p className="font-medium">Your profile is under review.</p>
          <p className="mt-1">
            It is not visible in the catalog yet. Meanwhile, add your services and working hours so
            you are ready the moment it is approved.
          </p>
        </div>
      )}
      {provider.status === "rejected" && (
        <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
          <p className="font-medium">Your application needs changes before it can be approved.</p>
          {provider.review_note && <p className="mt-1">Reviewer: “{provider.review_note}”</p>}
          <p className="mt-1">
            <Link href="/dashboard/profile" className="font-medium underline underline-offset-4">
              Update your profile
            </Link>{" "}
            — we will look at it again.
          </p>
        </div>
      )}
      {provider.status === "suspended" && (
        <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
          <p className="font-medium">Your profile is suspended and hidden from clients.</p>
          {provider.review_note && <p className="mt-1">Reason: “{provider.review_note}”</p>}
          <p className="mt-1">Existing bookings stay valid. Contact support to resolve it.</p>
        </div>
      )}

      {doneSteps < steps.length && (
        <CollapsibleSection
          title="Get ready for bookings"
          summary={`${doneSteps} of ${steps.length} done`}
          defaultOpen
        >
          <ol className="divide-y rounded-xl border bg-card">
            {steps.map((step) => {
              const Icon = step.done ? CircleCheckIcon : CircleIcon;
              const body = (
                <>
                  <Icon
                    className={cn(
                      "mt-0.5 size-5 shrink-0",
                      step.done ? "text-success" : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span>
                    <span
                      className={cn(
                        "block font-medium",
                        step.done && "text-muted-foreground line-through",
                      )}
                    >
                      {step.label}
                      <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                    </span>
                    {!step.done && (
                      <span className="block text-sm text-muted-foreground">{step.hint}</span>
                    )}
                  </span>
                </>
              );
              return (
                <li key={step.label}>
                  {step.href && !step.done ? (
                    <Link
                      href={step.href}
                      className="flex gap-3 p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </CollapsibleSection>
      )}

      {/* Each number opens the page behind it. */}
      <ul className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Upcoming sessions", value: upcoming.length, href: "/dashboard/bookings" },
          { label: "Active services", value: activeServices, href: "/dashboard/services" },
          {
            label: "Profile status",
            value: provider.status[0]!.toUpperCase() + provider.status.slice(1),
            href: "/dashboard/profile",
          },
        ].map((stat) => (
          <li key={stat.label}>
            <Link
              href={stat.href}
              className="block rounded-xl border bg-card p-5 outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="block text-sm text-muted-foreground">{stat.label}</span>
              <span className="mt-1 block text-2xl font-semibold">{stat.value}</span>
            </Link>
          </li>
        ))}
      </ul>

      {isAiConfigured() && <WeeklySummaryCard />}

      <section aria-labelledby="next-title">
        <div className="flex items-center justify-between">
          <h2 id="next-title" className="text-xl font-semibold">
            Next sessions
          </h2>
          <Link
            href="/dashboard/bookings"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            All bookings
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            No upcoming sessions yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {upcoming.slice(0, 5).map((b) => (
              <li key={b.id}>
                <BookingCard
                  booking={b}
                  audience="provider"
                  timeZone={provider.timezone}
                  now={now}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
