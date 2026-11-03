import { StarIcon } from "lucide-react";

import { pluralize } from "@/lib/catalog/format";

/**
 * Average and how many reviews have each rating, 5 stars first. The numbers are text; the bars only
 * repeat them visually and are hidden from screen readers.
 */
export function RatingBreakdown({
  average,
  total,
  counts,
}: {
  average: number;
  total: number;
  /** Index 0 = 5 stars … index 4 = 1 star. */
  counts: number[];
}) {
  return (
    <div className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:gap-8">
      <div className="shrink-0">
        <p className="flex items-center gap-2">
          <StarIcon className="size-6 fill-warning text-warning" aria-hidden="true" />
          <span className="text-3xl font-semibold">{average.toFixed(1)}</span>
          <span className="text-muted-foreground">out of 5</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {pluralize(total, "review", "reviews")}
        </p>
      </div>
      <ul aria-label="Reviews by rating" className="flex-1 space-y-1.5">
        {counts.map((count, i) => {
          const stars = 5 - i;
          return (
            <li key={stars} className="flex items-center gap-3 text-sm">
              <span className="w-14 shrink-0 text-muted-foreground">
                {pluralize(stars, "star", "stars")}
              </span>
              <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  // Share of all reviews, so the bars add up to the whole.
                  style={{ width: `${total ? (count / total) * 100 : 0}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right tabular-nums">
                {count}
                <span className="sr-only"> {count === 1 ? "review" : "reviews"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
