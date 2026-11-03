// Booking domain types. Mirror supabase/migrations/20261019000000_accounts_and_booking.sql.

/** Working hours on one ISO weekday (1 = Monday … 7 = Sunday), in the provider's local time. */
export type AvailabilityRule = {
  id: string;
  providerId: string;
  weekday: number;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
};

/** A day off (both times null) or a blocked interval on one local date. */
export type AvailabilityException = {
  id: string;
  providerId: string;
  /** "YYYY-MM-DD" in the provider's time zone */
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
};

/** An occupied interval (absolute time). */
export type BusyInterval = { startsAt: Date; endsAt: Date };

export const BOOKING_STATUSES = [
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "expired",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type Booking = {
  id: string;
  providerId: string;
  clientId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  priceCents: number;
  currency: string;
  serviceTitle: string;
  durationMin: number;
  providerName: string;
  providerTimezone: string;
  clientName: string;
  clientEmail: string;
  cancelledAt: string | null;
  createdAt: string;
  /** End of the payment hold (pending_payment only). */
  expiresAt: string | null;
  paidCents: number;
  refundedCents: number;
  /** Last time the booking was moved to another time, or null. */
  rescheduledAt: string | null;
};
