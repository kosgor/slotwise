// Background jobs. Every step.run is retried on its own (up to `retries` times) and its result is
// remembered: when a later step fails, the emails already sent are not sent again. Each email also
// has a Resend idempotency key, for the rare case that a step is retried after the email went out.

import { NonRetriableError, cron } from "inngest";

import {
  BookingCancelledEmail,
  BookingConfirmedEmail,
  BookingReminderEmail,
  BookingRescheduledEmail,
  NewBookingEmail,
  RefundIssuedEmail,
  SlotLostEmail,
} from "@/emails/booking-emails";
import { ProviderReviewedEmail, providerReviewSubject } from "@/emails/provider-emails";
import {
  DOCUMENTS_BUCKET,
  EmptyDocumentError,
  embedDocument,
  markDocument,
} from "@/lib/ai/documents";
import { closeCheckout } from "@/lib/booking/checkout";
import { bookingsOwedRefund, refundBooking } from "@/lib/booking/refunds";
import { emailWhen, loadBooking, providerEmail, toEmailBooking } from "@/lib/booking/server-data";
import { formatPrice } from "@/lib/catalog/format";
import { PermanentEmailError, sendEmail, type EmailMessage } from "@/lib/email/send";
import { isStripeConfigured, siteUrl, stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { inngest } from "./client";
import {
  bookingCancelled,
  bookingConfirmed,
  bookingRefunded,
  bookingRefundNeeded,
  bookingRescheduled,
  documentUploaded,
  providerRemoved,
  providerReviewed,
} from "./events";

/** A bad address will not fix itself: stop retrying, keep the error visible in Inngest. */
async function email(message: EmailMessage) {
  try {
    return await sendEmail(message);
  } catch (error) {
    if (error instanceof PermanentEmailError) throw new NonRetriableError(error.message);
    throw error;
  }
}

const REMINDER_HOURS_BEFORE = 24;

export const bookingConfirmedJob = inngest.createFunction(
  {
    id: "booking-confirmed",
    triggers: [bookingConfirmed],
    retries: 5,
    // A cancellation stops this run, including a reminder that is still waiting to be sent.
    cancelOn: [{ event: bookingCancelled, match: "data.bookingId" }],
  },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    const admin = createAdminClient();
    const booking = await step.run("load-booking", () => loadBooking(admin, bookingId));
    const details = toEmailBooking(booking);

    await step.run("email-client", () =>
      email({
        to: booking.client_email,
        subject: `Confirmed: ${booking.service_title} with ${booking.provider_name}`,
        react: <BookingConfirmedEmail booking={details} />,
        idempotencyKey: `confirmed-client:${bookingId}`,
      }),
    );
    await step.run("email-provider", async () => {
      const to = await providerEmail(admin, booking.provider_id);
      if (!to) return "no-provider-account";
      return email({
        to,
        subject: `New booking: ${booking.service_title}, ${details.when}`,
        react: <NewBookingEmail booking={details} />,
        idempotencyKey: `new-booking:${bookingId}`,
      });
    });

    const remindAt = new Date(
      new Date(booking.starts_at).getTime() - REMINDER_HOURS_BEFORE * 3_600_000,
    );
    if (remindAt.getTime() <= Date.now()) return { reminder: "too-close" };

    // The run sleeps inside Inngest (no server is busy waiting) and resumes on time.
    await step.sleepUntil("wait-for-reminder", remindAt);

    return step.run("email-reminder", async () => {
      // Re-check: the booking may have changed while we slept (cancelOn covers most cases).
      const current = await loadBooking(admin, bookingId);
      if (current.status !== "confirmed" || current.starts_at !== booking.starts_at)
        return "skipped";
      return email({
        to: current.client_email,
        subject: `Tomorrow: ${current.service_title} with ${current.provider_name}`,
        react: <BookingReminderEmail booking={toEmailBooking(current)} />,
        idempotencyKey: `reminder:${bookingId}`,
      });
    });
  },
);

export const bookingCancelledJob = inngest.createFunction(
  { id: "booking-cancelled", triggers: [bookingCancelled], retries: 5 },
  async ({ event, step }) => {
    const { bookingId, by } = event.data;
    const admin = createAdminClient();
    const booking = await step.run("load-booking", () => loadBooking(admin, bookingId));
    const details = toEmailBooking(booking);
    const owed = booking.paid_cents - booking.refunded_cents;
    const refund = owed > 0 ? formatPrice(owed, booking.currency) : null;

    await step.run("email-client", () =>
      email({
        to: booking.client_email,
        subject: `Cancelled: ${booking.service_title}, ${details.when}`,
        react: (
          <BookingCancelledEmail
            booking={details}
            audience="client"
            cancelledBy={by}
            refund={refund}
          />
        ),
        idempotencyKey: `cancelled-client:${bookingId}`,
      }),
    );
    await step.run("email-provider", async () => {
      // A removed provider gets one email about the removal, not one per booking.
      if (by === "platform") return "provider-removed";
      const to = await providerEmail(admin, booking.provider_id);
      if (!to) return "no-provider-account";
      return email({
        to,
        subject: `Cancelled: ${booking.service_title}, ${details.when}`,
        react: (
          <BookingCancelledEmail
            booking={details}
            audience="provider"
            cancelledBy={by}
            refund={null}
          />
        ),
        idempotencyKey: `cancelled-provider:${bookingId}`,
      });
    });
  },
);

export const bookingRescheduledJob = inngest.createFunction(
  {
    id: "booking-rescheduled",
    triggers: [bookingRescheduled],
    retries: 5,
    cancelOn: [{ event: bookingCancelled, match: "data.bookingId" }],
  },
  async ({ event, step }) => {
    const { bookingId, by, previousStartsAt, rescheduledAt } = event.data;
    const admin = createAdminClient();
    const booking = await step.run("load-booking", () => loadBooking(admin, bookingId));
    const details = toEmailBooking(booking);
    const previousWhen = emailWhen(previousStartsAt, booking.provider_timezone);
    const move = `${bookingId}:${rescheduledAt}`;

    await step.run("email-client", () =>
      email({
        to: booking.client_email,
        subject: `Moved: ${booking.service_title}, now ${details.when}`,
        react: (
          <BookingRescheduledEmail
            booking={details}
            previousWhen={previousWhen}
            audience="client"
            movedBy={by}
          />
        ),
        idempotencyKey: `rescheduled-client:${move}`,
      }),
    );
    await step.run("email-provider", async () => {
      const to = await providerEmail(admin, booking.provider_id);
      if (!to) return "no-provider-account";
      return email({
        to,
        subject: `Moved: ${booking.service_title}, now ${details.when}`,
        react: (
          <BookingRescheduledEmail
            booking={details}
            previousWhen={previousWhen}
            audience="provider"
            movedBy={by}
          />
        ),
        idempotencyKey: `rescheduled-provider:${move}`,
      });
    });

    // The reminder of the old time (booking-confirmed, or an earlier move) sees the new start and
    // skips itself; this run reminds about the new one.
    const remindAt = new Date(
      new Date(booking.starts_at).getTime() - REMINDER_HOURS_BEFORE * 3_600_000,
    );
    if (remindAt.getTime() <= Date.now()) return { reminder: "too-close" };
    await step.sleepUntil("wait-for-reminder", remindAt);

    return step.run("email-reminder", async () => {
      const current = await loadBooking(admin, bookingId);
      if (current.status !== "confirmed" || current.starts_at !== booking.starts_at)
        return "skipped";
      return email({
        to: current.client_email,
        subject: `Tomorrow: ${current.service_title} with ${current.provider_name}`,
        react: <BookingReminderEmail booking={toEmailBooking(current)} />,
        idempotencyKey: `reminder:${move}`,
      });
    });
  },
);

export const bookingRefundedJob = inngest.createFunction(
  { id: "booking-refunded", triggers: [bookingRefunded], retries: 5 },
  async ({ event, step }) => {
    const { bookingId, refundedCents } = event.data;
    const admin = createAdminClient();
    const booking = await step.run("load-booking", () => loadBooking(admin, bookingId));
    // A booking lost to a late payment gets its own explanation (booking-refund-needed).
    if (booking.status === "expired") return "explained-elsewhere";
    return step.run("email-client", () =>
      email({
        to: booking.client_email,
        subject: `Refund issued: ${booking.service_title}`,
        react: (
          <RefundIssuedEmail
            booking={toEmailBooking(booking)}
            amount={formatPrice(refundedCents, booking.currency)}
          />
        ),
        idempotencyKey: `refunded:${bookingId}:${refundedCents}`,
      }),
    );
  },
);

/** Money for a booking that cannot be kept: give it back and explain. */
export const bookingRefundNeededJob = inngest.createFunction(
  { id: "booking-refund-needed", triggers: [bookingRefundNeeded], retries: 8 },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    const admin = createAdminClient();
    const amount = await step.run("refund", () => refundBooking(admin, bookingId));
    const booking = await step.run("load-booking", () => loadBooking(admin, bookingId));
    if (booking.status !== "expired" || amount === 0) return { amount };
    await step.run("email-client", () =>
      email({
        to: booking.client_email,
        subject: `We could not keep your time — full refund`,
        react: (
          <SlotLostEmail
            booking={toEmailBooking(booking)}
            amount={formatPrice(amount, booking.currency)}
          />
        ),
        idempotencyKey: `slot-lost:${bookingId}`,
      }),
    );
    return { amount };
  },
);

/**
 * Every 5 minutes: unpaid holds whose 15 minutes are over become `expired` and their Stripe
 * Checkout pages are closed, so the client cannot pay for a slot that is no longer held. Then a
 * safety net: any cancelled or expired booking that still holds money is refunded (covers a
 * refund that failed or a job event that was never delivered).
 */
export const expireHoldsJob = inngest.createFunction(
  { id: "expire-unpaid-holds", triggers: [cron("*/5 * * * *")], retries: 2 },
  async ({ step }) => {
    const admin = createAdminClient();
    const expired = await step.run("expire-holds", async () => {
      const { data, error } = await admin.rpc("expire_stale_bookings");
      if (error) throw new Error(error.message);
      return data;
    });

    if (!isStripeConfigured()) return { expired: expired.length };

    await step.run("close-checkout-pages", async () => {
      for (const row of expired) {
        if (!row.stripe_checkout_session_id) continue;
        // Fails if the session is already complete or expired — nothing to close then.
        await stripe()
          .checkout.sessions.expire(row.stripe_checkout_session_id)
          .catch(() => undefined);
      }
    });

    const refunded = await step.run("refund-owed", async () => {
      const ids = await bookingsOwedRefund(admin);
      for (const id of ids) await refundBooking(admin, id);
      return ids.length;
    });
    return { expired: expired.length, refunded };
  },
);

/** Tells the provider about an admin decision on their profile. */
export const providerReviewedJob = inngest.createFunction(
  { id: "provider-reviewed", triggers: [providerReviewed], retries: 5 },
  async ({ event, step }) => {
    const { providerId, decision } = event.data;
    const admin = createAdminClient();
    const provider = await step.run("load-provider", async () => {
      const { data, error } = await admin
        .from("providers")
        .select("display_name, slug, status, review_note, reviewed_at")
        .eq("id", providerId)
        .single();
      if (error) throw new Error(`Provider ${providerId}: ${error.message}`);
      return data;
    });
    return step.run("email-provider", async () => {
      const to = await providerEmail(admin, providerId);
      if (!to) return "no-provider-account";
      return email({
        to,
        subject: providerReviewSubject(decision),
        react: (
          <ProviderReviewedEmail
            name={provider.display_name}
            decision={decision}
            note={provider.review_note}
            profileUrl={decision === "approve" ? siteUrl(`/pros/${provider.slug}`) : null}
          />
        ),
        idempotencyKey: `provider-reviewed:${providerId}:${provider.reviewed_at}`,
      });
    });
  },
);

/**
 * After remove_provider(): what the database cannot do itself. Every step is safe to repeat —
 * refunds carry idempotency keys, emails have Resend keys, cancelling a cancelled subscription or
 * deleting deleted files changes nothing. The reconciliation cron above refunds anything missed.
 */
export const providerRemovedJob = inngest.createFunction(
  { id: "provider-removed", triggers: [providerRemoved], retries: 8 },
  async ({ event, step }) => {
    const { providerId, userId, name, cancelled } = event.data;
    const admin = createAdminClient();

    for (const { bookingId, wasConfirmed } of cancelled) {
      if (wasConfirmed) {
        await step.run(`refund-${bookingId}`, () => refundBooking(admin, bookingId));
      } else {
        // An unpaid hold: close its Checkout page so nobody pays for a slot that is gone.
        await step.run(`close-checkout-${bookingId}`, async () => {
          const booking = await loadBooking(admin, bookingId);
          await closeCheckout(booking.stripe_checkout_session_id);
        });
      }
    }
    // Clients hear about their cancelled sessions (and their reminders are cancelled).
    const notify = cancelled.filter((b) => b.wasConfirmed);
    if (notify.length > 0) {
      await step.sendEvent(
        "tell-clients",
        notify.map(({ bookingId }) =>
          bookingCancelled.create({ bookingId, by: "platform" }, { id: `${bookingId}:cancelled` }),
        ),
      );
    }

    // No more Pro charges. Stripe's webhook then records the cancellation as usual.
    await step.run("cancel-subscription", async () => {
      const { data } = await admin
        .from("provider_subscriptions")
        .select("stripe_subscription_id, status")
        .eq("provider_id", providerId)
        .maybeSingle();
      const id = data?.stripe_subscription_id;
      if (!id || data.status === "canceled" || !isStripeConfigured()) return "none";
      await stripe()
        .subscriptions.cancel(id)
        .catch((e: { code?: string }) => {
          if (e.code !== "resource_missing") throw e;
        });
      return "cancelled";
    });

    // The document rows are gone already; the files under "<provider id>/" go now.
    await step.run("delete-documents", async () => {
      const bucket = admin.storage.from(DOCUMENTS_BUCKET);
      const { data, error } = await bucket.list(providerId, { limit: 100 });
      if (error) throw new Error(`Listing documents: ${error.message}`);
      if (data.length === 0) return 0;
      const removed = await bucket.remove(data.map((f) => `${providerId}/${f.name}`));
      if (removed.error) throw new Error(`Deleting documents: ${removed.error.message}`);
      return data.length;
    });

    return step.run("email-provider", async () => {
      // The row no longer points to the account (remove_provider() detached it).
      if (!userId) return "no-provider-account";
      const to = (await admin.auth.admin.getUserById(userId)).data.user?.email;
      if (!to) return "no-provider-account";
      const { data } = await admin
        .from("providers")
        .select("review_note")
        .eq("id", providerId)
        .single();
      return email({
        to,
        subject: providerReviewSubject("remove"),
        react: (
          <ProviderReviewedEmail
            name={name}
            decision="remove"
            note={data?.review_note ?? null}
            profileUrl={null}
          />
        ),
        idempotencyKey: `provider-removed:${providerId}`,
      });
    });
  },
);

/**
 * A provider document for the concierge: chunks and embeddings. Embedding and saving are one step,
 * so a retry never stores half a document (and embeddings never pass through Inngest state).
 */
export const processDocumentJob = inngest.createFunction(
  {
    id: "process-document",
    triggers: [documentUploaded],
    retries: 3,
    // Gemini free tier allows few embedding calls per minute: one document at a time.
    concurrency: { limit: 1 },
    onFailure: async ({ event, error }) => {
      const { documentId } = event.data.event.data;
      await markDocument(createAdminClient(), documentId, "failed", error.message);
    },
  },
  async ({ event, step }) => {
    const { documentId } = event.data;
    const admin = createAdminClient();
    await step.run("mark-processing", () => markDocument(admin, documentId, "processing"));
    return step.run("embed-and-save", async () => {
      try {
        return { chunks: await embedDocument(admin, documentId) };
      } catch (error) {
        if (error instanceof EmptyDocumentError) throw new NonRetriableError(error.message);
        throw error;
      }
    });
  },
);

export const functions = [
  processDocumentJob,
  providerReviewedJob,
  providerRemovedJob,
  bookingConfirmedJob,
  bookingCancelledJob,
  bookingRescheduledJob,
  bookingRefundedJob,
  bookingRefundNeededJob,
  expireHoldsJob,
];
