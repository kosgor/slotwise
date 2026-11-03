"use client";

import { CalendarClockIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { rescheduleBooking } from "@/lib/booking/actions";
import { dateKeyIn } from "@/lib/booking/calendar";
import { nextLocalDates } from "@/lib/booking/slots";
import {
  dateKeyToDate,
  formatDayLong,
  formatDayShort,
  formatTime,
  zoneLabel,
} from "@/lib/datetime";
import { cn } from "@/lib/utils";

/** Days offered for the new time. The database allows up to 60 days ahead (rules.ts). */
const DAYS_SHOWN = 28;

const subscribeNoop = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => null;

type Slots =
  { status: "loading" } | { status: "error" } | { status: "ready"; date: string; slots: string[] };

/** A finished request, remembered with the day it was for; any other day is still loading. */
type Loaded = { key: string } & ({ ok: true; date: string; slots: string[] } | { ok: false });

/**
 * Moving a booking: pick a day and a free time, then confirm. Free times come from
 * GET /api/bookings/:id/slots (the booking's own length; its current time is not "busy");
 * reschedule_booking() re-checks everything. On a phone the dialog sits at the bottom of the screen.
 */
export function RescheduleDialog({
  bookingId,
  summary,
  startsAt,
  durationMin,
  timeZone: fixedTimeZone,
  onDone,
  children,
}: {
  bookingId: string;
  /** "Private class, Tuesday 3 November, 10:00": what is being moved. */
  summary: string;
  startsAt: string;
  durationMin: number;
  /** Zone to show times in (the provider's, in the dashboard); the viewer's browser zone if absent. */
  timeZone?: string;
  /** Called after a successful move, e.g. to close a details dialog around this one. */
  onDone?: () => void;
  /** The trigger; a "Reschedule" button by default. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm">
            <CalendarClockIcon aria-hidden="true" />
            Reschedule<span className="sr-only">: {summary}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg">
        {open && (
          <Picker
            bookingId={bookingId}
            summary={summary}
            startsAt={startsAt}
            durationMin={durationMin}
            fixedTimeZone={fixedTimeZone}
            onDone={() => {
              setOpen(false);
              onDone?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  bookingId,
  summary,
  startsAt,
  durationMin,
  fixedTimeZone,
  onDone,
}: {
  bookingId: string;
  summary: string;
  startsAt: string;
  durationMin: number;
  fixedTimeZone?: string;
  onDone: () => void;
}) {
  const browserZone = useSyncExternalStore(subscribeNoop, browserTimeZone, serverTimeZone);
  const timeZone = fixedTimeZone ?? browserZone;
  const [dates] = useState(() =>
    timeZone ? nextLocalDates(timeZone, new Date(), DAYS_SHOWN) : [],
  );
  const [date, setDate] = useState<string | null>(dates[0] ?? null);
  const [slot, setSlot] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reload, setReload] = useState(0);
  const requestKey = `${date}|${timeZone}|${reload}`;
  const slots: Slots =
    !loaded || loaded.key !== requestKey
      ? { status: "loading" }
      : loaded.ok
        ? { status: "ready", date: loaded.date, slots: loaded.slots }
        : { status: "error" };
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!date || !timeZone) return;
    const controller = new AbortController();
    const key = `${date}|${timeZone}|${reload}`;
    fetch(`/api/bookings/${bookingId}/slots?${new URLSearchParams({ date, tz: timeZone })}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Slots request failed: ${res.status}`);
        const body = (await res.json()) as { slots: string[] };
        setLoaded({ key, ok: true, date, slots: body.slots });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, ok: false });
      });
    return () => controller.abort();
  }, [bookingId, date, timeZone, reload]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const free = slots.status === "ready" ? slots.slots : [];
  const selected = slot && free.includes(slot) ? slot : null;
  const currentDay = timeZone ? dateKeyIn(new Date(startsAt), timeZone) : null;
  const end = (iso: string) => new Date(new Date(iso).getTime() + durationMin * 60_000);

  function confirm() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await rescheduleBooking({ bookingId, startsAt: selected });
      if (result.status === "success") {
        toast.success(result.message);
        onDone();
        return;
      }
      if (result.code === "slot_taken" || result.code === "slot_unavailable") {
        setSlot(null);
        setReload((n) => n + 1);
      }
      setError(result.message ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move this booking</DialogTitle>
        <DialogDescription>
          {summary}. The payment stays with the booking; only the time changes.
        </DialogDescription>
      </DialogHeader>

      <fieldset className="min-w-0">
        <legend className="text-sm font-medium">New day</legend>
        {timeZone ? (
          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2">
            {dates.map((d) => (
              <label
                key={d}
                className={cn(
                  "relative flex min-w-16 shrink-0 cursor-pointer flex-col items-center rounded-lg border bg-card px-2 py-1.5 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  // The day it is booked for now, so moving within the same day is easy to find.
                  d === currentDay && "border-dashed border-primary",
                )}
              >
                <input
                  type="radio"
                  name={`reschedule-date-${bookingId}`}
                  value={d}
                  checked={d === date}
                  onChange={() => {
                    setDate(d);
                    setSlot(null);
                    setError(null);
                  }}
                  className="sr-only"
                />
                <span className="font-medium">
                  {formatDayShort(dateKeyToDate(d), "UTC").split(",")[0]}
                </span>
                <span>{formatDayShort(dateKeyToDate(d), "UTC").split(", ")[1]}</span>
                {d === currentDay && <span className="sr-only"> (booked now)</span>}
              </label>
            ))}
          </div>
        ) : (
          <Skeleton className="mt-2 h-12 w-full" />
        )}
      </fieldset>

      <fieldset className="min-w-0" aria-busy={slots.status === "loading" || undefined}>
        <legend className="text-sm font-medium">New time</legend>
        {timeZone && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Times in {zoneLabel(timeZone)}. Now booked for{" "}
            {formatDayLong(new Date(startsAt), timeZone)},{" "}
            {formatTime(new Date(startsAt), timeZone)}.
          </p>
        )}
        <div className="mt-2 min-h-24">
          {!timeZone || slots.status === "loading" ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : slots.status === "error" ? (
            <div role="alert" className="flex flex-wrap items-center gap-3">
              <span>We could not load free times.</span>
              <Button variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>
                <RefreshCwIcon aria-hidden="true" />
                Try again
              </Button>
            </div>
          ) : free.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
              No free times on {formatDayLong(dateKeyToDate(slots.date), "UTC")}. Please choose
              another day.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {free.map((s) => (
                <label
                  key={s}
                  className="relative flex h-9 cursor-pointer items-center justify-center rounded-lg border font-medium has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                >
                  <input
                    type="radio"
                    name={`reschedule-slot-${bookingId}`}
                    value={s}
                    checked={s === selected}
                    onChange={() => setSlot(s)}
                    className="sr-only"
                    aria-label={`${formatDayLong(new Date(s), timeZone)}, ${formatTime(new Date(s), timeZone)}–${formatTime(end(s), timeZone)}`}
                  />
                  {formatTime(new Date(s), timeZone)}
                </label>
              ))}
            </div>
          )}
          <p role="status" className="sr-only">
            {slots.status === "ready"
              ? `${free.length} free ${free.length === 1 ? "time" : "times"} on ${formatDayLong(dateKeyToDate(slots.date), "UTC")}`
              : ""}
          </p>
        </div>
      </fieldset>

      <div ref={errorRef} tabIndex={-1} className="outline-none">
        <FormMessage status={error ? "error" : "idle"} message={error ?? undefined} />
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Keep the current time
          </Button>
        </DialogClose>
        <Button
          type="button"
          disabled={!selected || pending}
          aria-busy={pending || undefined}
          onClick={confirm}
        >
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          {pending
            ? "Moving…"
            : selected && timeZone
              ? `Move to ${formatDayShort(new Date(selected), timeZone)}, ${formatTime(new Date(selected), timeZone)}`
              : "Move booking"}
        </Button>
      </DialogFooter>
    </>
  );
}
