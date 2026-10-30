"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheckIcon, ClockIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { bookSlot } from "@/lib/booking/actions";
import { nextLocalDates } from "@/lib/booking/slots";
import { formatDuration, formatPrice } from "@/lib/catalog/format";
import {
  dateKeyToDate,
  formatDayLong,
  formatDayShort,
  formatTime,
  zoneLabel,
} from "@/lib/datetime";
import { cn } from "@/lib/utils";

export type BookableService = {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  priceCents: number;
  currency: string;
};

type Props = {
  provider: { id: string; slug: string; name: string; timezone: string };
  services: BookableService[];
};

const DAYS_SHOWN = 14;

// The visitor's time zone is only known in the browser. On the server (and during hydration) it is
// null and the date/time steps render a skeleton — no server/client mismatch.
const subscribeNoop = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => null;

export function BookingFlow(props: Props) {
  // A QueryClient per booking page: TanStack Query is only needed here, so it stays out of every
  // other page's JavaScript.
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Flow {...props} />
    </QueryClientProvider>
  );
}

function Flow({ provider, services }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const timeZone = useSyncExternalStore(subscribeNoop, browserTimeZone, serverTimeZone);

  // Initial selection comes from the URL, so "sign in and come back" restores it.
  const [serviceId, setServiceId] = useState(
    () => services.find((s) => s.id === searchParams.get("service"))?.id ?? services[0]?.id ?? "",
  );
  const [date, setDate] = useState<string | null>(() => searchParams.get("date"));
  const [slot, setSlot] = useState<string | null>(() => searchParams.get("slot"));
  const [result, setResult] = useState<{ status: "idle" | "error"; message?: string }>({
    status: "idle",
  });
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLDivElement>(null);

  const service = services.find((s) => s.id === serviceId);
  const dates = timeZone ? nextLocalDates(timeZone, new Date(), DAYS_SHOWN) : [];
  const activeDate = date && dates.includes(date) ? date : (dates[0] ?? null);

  const slotsQuery = useQuery({
    queryKey: ["slots", provider.id, serviceId, activeDate, timeZone],
    enabled: Boolean(serviceId && activeDate && timeZone),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        slug: provider.slug,
        provider: provider.id,
        service: serviceId,
        date: activeDate!,
        tz: timeZone!,
      });
      const res = await fetch(`/api/slots?${params}`, { signal });
      if (!res.ok) throw new Error(`Slots request failed: ${res.status}`);
      return ((await res.json()) as { slots: string[] }).slots;
    },
  });
  const slots = slotsQuery.data ?? [];
  const selectedSlot = slot && slots.includes(slot) ? slot : null;

  useEffect(() => {
    if (result.status === "error") errorRef.current?.focus();
  }, [result]);

  function confirm() {
    if (!service || !selectedSlot) return;
    setResult({ status: "idle" });
    startTransition(async () => {
      const response = await bookSlot({ serviceId: service.id, startsAt: selectedSlot });
      // On success the action redirects (to Stripe for paid services, to /account for free ones);
      // we only get here on errors.
      if (response.code === "not_authenticated") {
        const back = `/pros/${provider.slug}/book?${new URLSearchParams({
          service: service.id,
          date: activeDate!,
          slot: selectedSlot,
        })}`;
        router.push(`/login?next=${encodeURIComponent(back)}`);
        return;
      }
      if (response.code === "slot_taken" || response.code === "slot_unavailable") {
        setSlot(null);
        await queryClient.invalidateQueries({ queryKey: ["slots", provider.id] });
      }
      setResult({ status: "error", message: response.message });
    });
  }

  return (
    <div className="space-y-10">
      <fieldset className="min-w-0">
        <legend className="text-lg font-semibold">1. Choose a service</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer gap-3 rounded-xl border bg-card p-4 transition-colors has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="service"
                value={s.id}
                checked={s.id === serviceId}
                onChange={() => {
                  setServiceId(s.id);
                  setSlot(null);
                }}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex-1">
                <span className="block font-medium">{s.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {formatDuration(s.durationMin)} ·{" "}
                  {s.priceCents === 0 ? "Free" : formatPrice(s.priceCents, s.currency)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="text-lg font-semibold">2. Choose a day</legend>
        {timeZone ? (
          <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
            {dates.map((d) => (
              <label
                key={d}
                className="relative flex min-w-20 shrink-0 cursor-pointer flex-col items-center rounded-xl border bg-card px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input
                  type="radio"
                  name="date"
                  value={d}
                  checked={d === activeDate}
                  onChange={() => {
                    setDate(d);
                    setSlot(null);
                  }}
                  className="sr-only"
                />
                {/* Day names come from the date itself, formatted in UTC so the label never shifts. */}
                <span className="font-medium">
                  {formatDayShort(dateKeyToDate(d), "UTC").split(",")[0]}
                </span>
                <span>{formatDayShort(dateKeyToDate(d), "UTC").split(", ")[1]}</span>
              </label>
            ))}
          </div>
        ) : (
          <Skeleton className="mt-4 h-16 w-full" />
        )}
      </fieldset>

      <fieldset className="min-w-0" aria-busy={slotsQuery.isFetching || undefined}>
        <legend className="text-lg font-semibold">3. Choose a time</legend>
        {timeZone && (
          <p className="mt-1 text-sm text-muted-foreground">
            Times are in your time zone ({zoneLabel(timeZone)}).
            {timeZone !== provider.timezone &&
              ` ${provider.name} works in ${zoneLabel(provider.timezone)}.`}
          </p>
        )}
        <div className="mt-4">
          {!timeZone || slotsQuery.isPending ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : slotsQuery.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
              <span>We could not load free times.</span>
              <Button variant="outline" size="sm" onClick={() => slotsQuery.refetch()}>
                <RefreshCwIcon aria-hidden="true" />
                Try again
              </Button>
            </div>
          ) : slots.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No free times on {formatDayLong(dateKeyToDate(activeDate!), "UTC")}. Please choose
              another day.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {slots.map((s) => (
                <label
                  key={s}
                  className="relative flex h-10 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                >
                  <input
                    type="radio"
                    name="slot"
                    value={s}
                    checked={s === selectedSlot}
                    onChange={() => setSlot(s)}
                    className="sr-only"
                    // Full name for screen readers: day and end time, not just "10:00".
                    aria-label={`${formatDayLong(new Date(s), timeZone)}, ${formatTime(new Date(s), timeZone)}–${formatTime(
                      new Date(new Date(s).getTime() + (service?.durationMin ?? 0) * 60_000),
                      timeZone,
                    )}`}
                  />
                  {formatTime(new Date(s), timeZone)}
                </label>
              ))}
            </div>
          )}
          {/* Announces the result of loading times for the chosen day. */}
          <p role="status" className="sr-only">
            {timeZone && slotsQuery.isSuccess
              ? `${slots.length} free ${slots.length === 1 ? "time" : "times"} on ${formatDayLong(dateKeyToDate(activeDate!), "UTC")}`
              : ""}
          </p>
        </div>
      </fieldset>

      <section aria-labelledby="confirm-title" className="rounded-2xl border bg-card p-6">
        <h2 id="confirm-title" className="text-lg font-semibold">
          4. Confirm
        </h2>
        {service && selectedSlot && timeZone ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Service</dt>
              <dd className="font-medium">{service.title}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <ClockIcon className="size-4" aria-hidden="true" />
                When
              </dt>
              <dd className="font-medium">
                {formatDayLong(new Date(selectedSlot), timeZone)},{" "}
                {formatTime(new Date(selectedSlot), timeZone)} (
                {formatDuration(service.durationMin)})
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Price</dt>
              <dd className="font-medium">
                {service.priceCents === 0
                  ? "Free"
                  : formatPrice(service.priceCents, service.currency)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Choose a time to see the summary.</p>
        )}

        <div ref={errorRef} tabIndex={-1} className="mt-4 outline-none">
          <FormMessage status={result.status} message={result.message} />
        </div>

        <Button
          size="lg"
          className="mt-4 h-11 w-full sm:w-auto"
          disabled={!selectedSlot || pending}
          aria-busy={pending || undefined}
          onClick={confirm}
        >
          {pending ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <CalendarCheckIcon aria-hidden="true" />
          )}
          {pending
            ? "Booking…"
            : service && service.priceCents > 0
              ? "Continue to payment"
              : "Confirm booking"}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Payment is handled securely by Stripe; we hold the time for you for 15 minutes while you
          pay. Free cancellation with a full refund up to 24 hours before the session. You will be
          asked to sign in if you are not signed in yet.
        </p>
      </section>
    </div>
  );
}

export function BookingFlowSkeleton() {
  return (
    <div className={cn("space-y-6")} aria-busy="true">
      <span className="sr-only" role="status">
        Loading booking…
      </span>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
