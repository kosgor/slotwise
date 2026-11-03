// Events that start background jobs. The schema validates data on send and types it in handlers.

import { eventType } from "inngest";
import { z } from "zod";

/** A booking became confirmed (paid, or free). Sends confirmations and schedules the reminder. */
export const bookingConfirmed = eventType("booking/confirmed", {
  schema: z.object({ bookingId: z.uuid() }),
});

/**
 * A booking was cancelled. Cancels the pending reminder and tells the other side. "platform": the
 * provider was removed from Slotwise — only the client hears about it.
 */
export const bookingCancelled = eventType("booking/cancelled", {
  schema: z.object({
    bookingId: z.uuid(),
    by: z.enum(["client", "provider", "platform"]),
  }),
});

/**
 * A confirmed booking moved to another time (reschedule_booking()). Tells both sides and schedules
 * the reminder for the new time. `previousStartsAt` is the old time, for the email;
 * `rescheduledAt` tells one move from the next (email idempotency keys).
 */
export const bookingRescheduled = eventType("booking/rescheduled", {
  schema: z.object({
    bookingId: z.uuid(),
    by: z.enum(["client", "provider"]),
    previousStartsAt: z.iso.datetime({ offset: true }),
    rescheduledAt: z.iso.datetime({ offset: true }),
  }),
});

/**
 * An admin removed a provider (remove_provider()). Carries what the database cancelled, so the job
 * refunds exactly those bookings, and who to email: the name from before it was anonymised and the
 * account the row was detached from (null for a seed profile without one).
 */
export const providerRemoved = eventType("provider/removed", {
  schema: z.object({
    providerId: z.uuid(),
    userId: z.uuid().nullable(),
    name: z.string(),
    cancelled: z.array(z.object({ bookingId: z.uuid(), wasConfirmed: z.boolean() })),
  }),
});

/** Stripe confirmed a refund (charge.refunded). Tells the client. */
export const bookingRefunded = eventType("booking/refunded", {
  schema: z.object({ bookingId: z.uuid(), refundedCents: z.int().nonnegative() }),
});

/** An admin approved, rejected or suspended a provider profile. Tells the provider. */
export const providerReviewed = eventType("provider/reviewed", {
  schema: z.object({
    providerId: z.uuid(),
    decision: z.enum(["approve", "reject", "suspend"]),
  }),
});

/** Money arrived for a booking that cannot be kept (see stripe_checkout_completed). */
export const bookingRefundNeeded = eventType("booking/refund-needed", {
  schema: z.object({ bookingId: z.uuid() }),
});

/** A provider uploaded a document for the AI concierge. Chunks it and stores embeddings. */
export const documentUploaded = eventType("document/uploaded", {
  schema: z.object({ documentId: z.uuid() }),
});
