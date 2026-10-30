import { TrashIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { NoProviderProfile } from "@/components/features/dashboard/no-provider";
import { ExceptionForm } from "@/components/features/provider/provider-forms";
import { ScheduleEditor } from "@/components/features/provider/schedule-editor";
import { CollapsibleSection } from "@/components/data-view/collapsible-section";
import { ActionButton } from "@/components/forms/action-button";
import { Skeleton } from "@/components/ui/skeleton";
import { dateKeyIn } from "@/lib/booking/calendar";
import { dateKeyToDate, formatDayLong } from "@/lib/datetime";
import { removeException } from "@/lib/provider/actions";
import { getProviderContext, timeZoneOptions } from "@/lib/provider/context";
import { getOwnSchedule } from "@/lib/provider/queries";

export const metadata: Metadata = { title: "Schedule", robots: { index: false } };

export default function SchedulePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <Schedule />
    </Suspense>
  );
}

async function Schedule() {
  const { provider } = await getProviderContext("/dashboard/schedule");
  if (!provider) return <NoProviderProfile />;
  const { rules, exceptions } = await getOwnSchedule(provider.id);
  const today = dateKeyIn(new Date(), provider.timezone);
  const upcoming = exceptions.filter((e) => e.date >= today);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Schedule</h1>
        <p className="mt-1 text-muted-foreground">
          Clients can book 30-minute steps inside these hours, from 1 hour to 60 days ahead.
        </p>
      </div>

      <section aria-labelledby="weekly-title" className="space-y-4">
        <h2 id="weekly-title" className="text-xl font-semibold">
          Weekly hours
        </h2>
        <ScheduleEditor
          initialRules={rules}
          initialTimeZone={provider.timezone}
          timeZones={timeZoneOptions(provider.timezone)}
        />
      </section>

      {/* Past days off are left out: they no longer change anything. */}
      <CollapsibleSection
        title="Days off and blocked time"
        summary={upcoming.length === 0 ? "none planned" : `${upcoming.length} upcoming`}
        defaultOpen
      >
        {upcoming.length > 0 && (
          <ul className="divide-y rounded-xl border bg-card">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span>
                  <span className="font-medium">{formatDayLong(dateKeyToDate(e.date), "UTC")}</span>
                  {" — "}
                  {e.startTime ? `${e.startTime}–${e.endTime}` : "whole day"}
                  {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                </span>
                <ActionButton
                  action={removeException}
                  fields={{ id: e.id }}
                  size="icon"
                  pendingLabel="…"
                >
                  <TrashIcon aria-hidden="true" />
                  <span className="sr-only">Remove time off on {e.date}</span>
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-xl border bg-card p-5">
          <ExceptionForm />
        </div>
      </CollapsibleSection>
    </div>
  );
}
