import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NoProviderProfile } from "@/components/features/dashboard/no-provider";
import { ServiceDialog } from "@/components/features/provider/provider-forms";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionButton } from "@/components/forms/action-button";
import { TableLink, TableNavigationProvider } from "@/components/data-view/table-navigation";
import { effectivePlan, FREE_SERVICE_LIMIT } from "@/lib/billing/plans";
import { getOwnSubscription } from "@/lib/billing/queries";
import { formatDuration, formatPrice } from "@/lib/catalog/format";
import { setServiceActive } from "@/lib/provider/actions";
import { getProviderContext } from "@/lib/provider/context";
import { getOwnServices } from "@/lib/provider/queries";

export const metadata: Metadata = { title: "Services", robots: { index: false } };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "disabled", label: "Disabled" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

export default function ServicesPage({ searchParams }: PageProps<"/dashboard/services">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Services searchParams={searchParams} />
    </Suspense>
  );
}

async function Services({ searchParams }: Pick<PageProps<"/dashboard/services">, "searchParams">) {
  const params = await searchParams;
  const { provider } = await getProviderContext("/dashboard/services");
  if (!provider) return <NoProviderProfile />;
  const [services, subscription] = await Promise.all([
    getOwnServices(provider.id),
    getOwnSubscription(provider.id),
  ]);
  const onFree = effectivePlan(subscription) === "free";
  const activeCount = services.filter((s) => s.active).length;
  const show: Filter = params.show === "active" || params.show === "disabled" ? params.show : "all";
  const counts: Record<Filter, number> = {
    all: services.length,
    active: activeCount,
    disabled: services.length - activeCount,
  };
  const visible = services.filter((s) =>
    show === "all" ? true : show === "active" ? s.active : !s.active,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-muted-foreground">
            Disabled services are hidden from clients. Existing bookings stay valid.
          </p>
        </div>
        <ServiceDialog />
      </div>
      {onFree && (
        <p className="text-sm text-muted-foreground">
          {activeCount} of {FREE_SERVICE_LIMIT} active services on the Free plan.{" "}
          <Link
            href="/dashboard/billing"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Upgrade to Pro
          </Link>{" "}
          for unlimited services.
        </p>
      )}
      {services.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No services yet. Add the first one so clients can book you.
        </p>
      ) : (
        <TableNavigationProvider>
          {/* Shown once there is something to filter; switching keeps the page where it is. */}
          {services.length > 1 && (
            <nav aria-label="Filter services" className="flex gap-4 text-sm">
              {FILTERS.map((f) => (
                <TableLink
                  key={f.id}
                  href={f.id === "all" ? "/dashboard/services" : `/dashboard/services?show=${f.id}`}
                  aria-current={show === f.id ? "page" : undefined}
                  className="font-medium underline-offset-4 hover:underline aria-[current=page]:underline"
                >
                  {f.label}{" "}
                  <span className="text-muted-foreground tabular-nums">({counts[f.id]})</span>
                </TableLink>
              ))}
            </nav>
          )}
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              {show === "active"
                ? "No active services: clients cannot book you right now."
                : "No disabled services."}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {visible.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{s.title}</h2>
                      {!s.active && <Badge variant="outline">Disabled</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDuration(s.duration_min)} ·{" "}
                      {s.price_cents === 0 ? "Free" : formatPrice(s.price_cents, s.currency)}
                    </p>
                    {s.description && (
                      <p className="mt-1 line-clamp-2 max-w-prose text-sm text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <ServiceDialog
                      service={{
                        id: s.id,
                        title: s.title,
                        description: s.description,
                        durationMin: s.duration_min,
                        price: s.price_cents / 100,
                      }}
                    />
                    <ActionButton
                      action={setServiceActive}
                      fields={{ id: s.id, active: s.active ? "false" : "true" }}
                    >
                      {s.active ? "Disable" : "Enable"}
                      <span className="sr-only"> {s.title}</span>
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TableNavigationProvider>
      )}
    </div>
  );
}
