"use client";

import { PlusIcon, TrashIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { SelectField } from "@/components/forms/fields";
import { FormMessage } from "@/components/forms/form-message";
import { useResultToast } from "@/components/forms/toasts";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSchedule, type ProviderFormState } from "@/lib/provider/actions";
import { scheduleSchema } from "@/lib/validation/provider";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Interval = { key: number; startTime: string; endTime: string };
type Week = Record<number, Interval[]>;

let nextKey = 1;

export function ScheduleEditor({
  initialRules,
  initialTimeZone,
  timeZones,
}: {
  initialRules: { weekday: number; startTime: string; endTime: string }[];
  initialTimeZone: string;
  timeZones: string[];
}) {
  const [week, setWeek] = useState<Week>(() => {
    const w: Week = {};
    for (let d = 1; d <= 7; d++) w[d] = [];
    for (const r of initialRules)
      w[r.weekday]!.push({ key: nextKey++, startTime: r.startTime, endTime: r.endTime });
    return w;
  });
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [result, setResult] = useState<ProviderFormState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  useResultToast(result);

  const update = (day: number, fn: (list: Interval[]) => Interval[]) =>
    setWeek((w) => ({ ...w, [day]: fn(w[day]!) }));

  function save(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      timezone: timeZone,
      rules: Object.entries(week).flatMap(([day, list]) =>
        list.map((i) => ({ weekday: Number(day), startTime: i.startTime, endTime: i.endTime })),
      ),
    };
    // Same schema the server uses: catches overlaps and "end before start" before the round trip.
    const parsed = scheduleSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const rule = typeof issue.path[1] === "number" ? input.rules[issue.path[1]] : undefined;
      setResult({
        status: "error",
        message: rule ? `${WEEKDAYS[rule.weekday - 1]}: ${issue.message}` : issue.message,
      });
      return;
    }
    startTransition(async () => setResult(await saveSchedule(parsed.data)));
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <SelectField
        label="Time zone"
        name="timezone"
        hint="Working hours below are in this time zone. Clients see times converted to theirs."
        options={timeZones.map((tz) => ({ value: tz, label: tz }))}
        value={timeZone}
        onChange={(e) => setTimeZone(e.target.value)}
        className="max-w-sm"
      />

      <div className="divide-y rounded-xl border bg-card">
        {WEEKDAYS.map((name, index) => {
          const day = index + 1;
          const intervals = week[day]!;
          return (
            <fieldset key={day} className="grid gap-3 p-4 sm:grid-cols-[140px_1fr] sm:items-start">
              <legend className="contents">
                <span className="pt-2 font-medium">{name}</span>
              </legend>
              <div className="space-y-2">
                {intervals.length === 0 && (
                  <p className="pt-2 text-sm text-muted-foreground">Day off</p>
                )}
                {intervals.map((interval, n) => (
                  <div key={interval.key} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`d${day}-s${interval.key}`}>
                      {name}, start {n + 1}
                    </label>
                    <Input
                      id={`d${day}-s${interval.key}`}
                      type="time"
                      step={1800}
                      value={interval.startTime}
                      onChange={(e) =>
                        update(day, (l) =>
                          l.map((i) =>
                            i.key === interval.key ? { ...i, startTime: e.target.value } : i,
                          ),
                        )
                      }
                      className="h-10 w-32"
                    />
                    <span aria-hidden="true">–</span>
                    <label className="sr-only" htmlFor={`d${day}-e${interval.key}`}>
                      {name}, end {n + 1}
                    </label>
                    <Input
                      id={`d${day}-e${interval.key}`}
                      type="time"
                      step={1800}
                      value={interval.endTime}
                      onChange={(e) =>
                        update(day, (l) =>
                          l.map((i) =>
                            i.key === interval.key ? { ...i, endTime: e.target.value } : i,
                          ),
                        )
                      }
                      className="h-10 w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${name} hours ${interval.startTime}–${interval.endTime}`}
                      onClick={() => update(day, (l) => l.filter((i) => i.key !== interval.key))}
                    >
                      <TrashIcon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update(day, (l) => [
                      ...l,
                      l.length === 0
                        ? { key: nextKey++, startTime: "09:00", endTime: "17:00" }
                        : { key: nextKey++, startTime: l.at(-1)!.endTime, endTime: "20:00" },
                    ])
                  }
                >
                  <PlusIcon aria-hidden="true" />
                  Add hours<span className="sr-only"> on {name}</span>
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>

      <FormMessage status={result.status === "error" ? "error" : "idle"} message={result.message} />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save schedule
      </SubmitButton>
    </form>
  );
}
