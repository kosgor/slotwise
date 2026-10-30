// Numbers for the provider's weekly summary. Computed here, in code: the model only puts them into
// words and never does arithmetic (models are bad at sums and good at sentences).
// Pure function, tested in tests/unit/ai-weekly-stats.test.ts.

import { formatPrice } from "@/lib/catalog/format";
import { displayStatus } from "@/lib/booking/status";
import type { Booking } from "@/lib/booking/types";

const DAY = 86_400_000;

export type WeeklyStats = {
  pastWeek: {
    sessions: number;
    earned: string;
    cancellations: number;
    newBookings: number;
  };
  nextWeek: {
    sessions: number;
    busiestDay: string | null;
    freeDays: string[];
  };
};

export function weeklyStats(bookings: Booking[], now: Date, timeZone: string): WeeklyStats {
  const weekAgo = now.getTime() - 7 * DAY;
  const weekAhead = now.getTime() + 7 * DAY;
  const t = (iso: string) => new Date(iso).getTime();
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone });

  const past = bookings.filter((b) => t(b.startsAt) >= weekAgo && t(b.startsAt) < now.getTime());
  const held = past.filter((b) => ["confirmed", "completed"].includes(displayStatus(b, now)));
  const earnedCents = held.reduce((sum, b) => sum + b.paidCents - b.refundedCents, 0);
  const currency = bookings[0]?.currency ?? "GBP";

  const upcoming = bookings.filter(
    (b) =>
      displayStatus(b, now) === "confirmed" &&
      t(b.startsAt) >= now.getTime() &&
      t(b.startsAt) < weekAhead,
  );
  const perDay = new Map<string, number>();
  for (const b of upcoming) {
    const day = weekday.format(new Date(b.startsAt));
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  let busiestDay: string | null = null;
  for (const [day, count] of perDay)
    if (!busiestDay || count > perDay.get(busiestDay)!) busiestDay = day;
  const nextDays = Array.from({ length: 7 }, (_, i) =>
    weekday.format(new Date(now.getTime() + i * DAY)),
  );

  return {
    pastWeek: {
      sessions: held.length,
      earned: formatPrice(earnedCents, currency),
      cancellations: bookings.filter(
        (b) =>
          b.cancelledAt !== null && t(b.cancelledAt) >= weekAgo && t(b.cancelledAt) < now.getTime(),
      ).length,
      newBookings: bookings.filter(
        (b) => t(b.createdAt) >= weekAgo && displayStatus(b, now) !== "expired",
      ).length,
    },
    nextWeek: {
      sessions: upcoming.length,
      busiestDay,
      freeDays: nextDays.filter((d) => !perDay.has(d)),
    },
  };
}
