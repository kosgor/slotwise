// One series per day as columns, with a text alternative (summary + table). Pure HTML/CSS: the
// admin dashboard needs no chart library. Hover or tap a column to see its value; keyboard and
// screen reader users get the same numbers from the summary and the table.

import { formatDayShort } from "@/lib/datetime";
import type { DayPoint } from "@/lib/admin/metrics";

type Props = {
  title: string;
  /** One or two sentences with the key numbers — what a sighted reader takes from the chart. */
  summary: string;
  points: DayPoint[];
  format: (value: number) => string;
};

const dayLabel = (date: string) => formatDayShort(new Date(`${date}T12:00:00Z`), "UTC");

export function DailyBarChart({ title, summary, points, format }: Props) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const headingId = `chart-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <figure aria-labelledby={headingId} className="rounded-xl border bg-card p-5">
      <h3 id={headingId} className="font-semibold">
        {title}
      </h3>
      <figcaption className="mt-1 text-sm text-muted-foreground">{summary}</figcaption>

      {/* The picture; its numbers are in the summary and the table below. */}
      <div aria-hidden="true" className="mt-4">
        <div className="relative flex h-36 items-end gap-0.5 border-b border-border">
          {points.map((p) => (
            <div
              key={p.date}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <div
                className="w-full max-w-6 rounded-t bg-chart-1 transition-opacity group-hover:opacity-80"
                style={{
                  height: max === 0 ? 0 : `${Math.max((p.value / max) * 100, p.value ? 2 : 0)}%`,
                }}
              />
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm group-hover:block">
                {dayLabel(p.date)}: {format(p.value)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{dayLabel(points[0]!.date)}</span>
          <span>max {format(max)}</span>
          <span>{dayLabel(points.at(-1)!.date)}</span>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">Show as table</summary>
        <div
          className="mt-2 max-h-64 overflow-y-auto"
          tabIndex={0}
          role="region"
          aria-label={`${title}, table`}
        >
          <table className="w-full">
            <caption className="sr-only">{title} by day</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 font-medium">
                  Day
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {points.map((p) => (
                <tr key={p.date}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {dayLabel(p.date)}
                  </th>
                  <td className="py-1 text-right tabular-nums">{format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
