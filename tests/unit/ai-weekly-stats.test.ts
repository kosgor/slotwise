import { describe, expect, it } from "vitest";

import { weeklyStats } from "@/lib/ai/weekly-stats";
import type { Booking } from "@/lib/booking/types";

const NOW = new Date("2026-10-26T12:00:00Z"); // Monday
let n = 0;
const b = (patch: Partial<Booking>): Booking => ({
  id: `b${n++}`,
  providerId: "p",
  clientId: "c",
  serviceId: "s",
  startsAt: "2026-10-22T10:00:00Z",
  endsAt: "2026-10-22T11:00:00Z",
  status: "confirmed",
  priceCents: 5000,
  currency: "GBP",
  serviceTitle: "Yoga",
  durationMin: 60,
  providerName: "Anna",
  providerTimezone: "UTC",
  clientName: "Alice",
  clientEmail: "a@example.com",
  cancelledAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  expiresAt: null,
  paidCents: 5000,
  refundedCents: 0,
  rescheduledAt: null,
  ...patch,
});

describe("weeklyStats", () => {
  it("counts held sessions and money kept in the last 7 days", () => {
    const stats = weeklyStats(
      [
        b({}),
        b({ refundedCents: 2000 }),
        b({ startsAt: "2026-10-10T10:00:00Z" }), // older than a week
        b({ status: "cancelled", cancelledAt: "2026-10-24T09:00:00Z", refundedCents: 5000 }),
      ],
      NOW,
      "UTC",
    );
    expect(stats.pastWeek).toMatchObject({ sessions: 2, earned: "£80", cancellations: 1 });
  });

  it("finds the busiest day and the free days of the next 7 days", () => {
    const stats = weeklyStats(
      [
        b({ startsAt: "2026-10-28T09:00:00Z" }),
        b({ startsAt: "2026-10-28T11:00:00Z" }),
        b({ startsAt: "2026-10-29T09:00:00Z" }),
        b({ startsAt: "2026-11-10T09:00:00Z" }), // beyond the week
      ],
      NOW,
      "UTC",
    );
    expect(stats.nextWeek.sessions).toBe(3);
    expect(stats.nextWeek.busiestDay).toBe("Wednesday");
    expect(stats.nextWeek.freeDays).not.toContain("Wednesday");
    expect(stats.nextWeek.freeDays).toContain("Friday");
  });

  it("handles a week without bookings", () => {
    const stats = weeklyStats([], NOW, "UTC");
    expect(stats.pastWeek.sessions).toBe(0);
    expect(stats.nextWeek.busiestDay).toBeNull();
    expect(stats.nextWeek.freeDays).toHaveLength(7);
  });
});
