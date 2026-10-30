"use server";

// Admin Server Actions. The role check here only gives a clear message: review_provider(),
// remove_provider() and moderate_review() check that the caller is an admin again, in the database.

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { providerRemoved, providerReviewed } from "@/inngest/events";
import { getCurrentUser } from "@/lib/auth/session";
import { bookingErrorMessage } from "@/lib/booking/errors";
import { sendJobs } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";
import {
  moderateReviewSchema,
  removeProviderSchema,
  reviewProviderSchema,
} from "@/lib/validation/admin";

export type AdminActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

// The actions return their result instead of redirecting: a redirect would scroll the admin back to
// the top of the page. revalidatePath() sends the updated table with the response, the dialog
// closes and the message is shown as a toast (components/features/admin/review-actions.tsx).

const DONE: Record<"approve" | "reject" | "suspend", string> = {
  approve: "approved. The profile is in the catalog now.",
  reject: "rejected. They see your reason in their dashboard and by email.",
  suspend: "suspended and hidden from the catalog.",
};

function removedSummary(n: number): string {
  if (n === 0) return "No upcoming bookings to cancel.";
  return `${n} upcoming ${n === 1 ? "booking was" : "bookings were"} cancelled; refunds and emails are on their way.`;
}

/**
 * Removes a provider for good (remove_provider()). The database does everything it can in one
 * transaction; refunds, emails, the Stripe subscription and the files follow in provider-removed.
 */
export async function removeProvider(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await getCurrentUser();
  if (user?.role !== "admin")
    return { status: "error", message: bookingErrorMessage({ message: "not_admin" }) };

  const parsed = removeProviderSchema.safeParse({
    providerId: formData.get("providerId"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the form.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const { providerId, reason } = parsed.data;

  const supabase = await createClient();
  // The name and the address before they are anonymised: for the email and the cache.
  const { data: before } = await supabase
    .from("providers")
    .select("display_name, slug")
    .eq("id", providerId)
    .maybeSingle();
  if (!before)
    return { status: "error", message: bookingErrorMessage({ message: "provider_not_found" }) };

  const { data, error } = await supabase.rpc("remove_provider", {
    p_provider_id: providerId,
    p_reason: reason ?? "",
  });
  if (error || !data) return { status: "error", message: bookingErrorMessage(error) };

  updateTag("catalog");
  updateTag(`provider:${before.slug}`);
  revalidatePath("/admin");
  const { cancelled, userId } = data as {
    cancelled: { bookingId: string; wasConfirmed: boolean }[];
    userId: string | null;
  };
  // Best effort like every job: if Inngest is unreachable, the reconciliation cron still refunds
  // the cancelled bookings; the subscription and the files would need the job to be re-sent.
  await sendJobs(
    providerRemoved.create(
      { providerId, userId, name: before.display_name, cancelled },
      { id: `${providerId}:removed` },
    ),
  );
  // The name is anonymised by now; the audit log keeps it.
  return {
    status: "success",
    message: `${before.display_name} removed. ${removedSummary(cancelled.length)} The audit log has the details.`,
  };
}

export async function reviewProvider(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await getCurrentUser();
  if (user?.role !== "admin")
    return { status: "error", message: bookingErrorMessage({ message: "not_admin" }) };

  const parsed = reviewProviderSchema.safeParse({
    providerId: formData.get("providerId"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the form.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const { providerId, decision, note } = parsed.data;

  const supabase = await createClient();
  const { data: provider, error } = await supabase.rpc("review_provider", {
    p_provider_id: providerId,
    p_decision: decision,
    p_note: note ?? "",
  });
  if (error || !provider) {
    return {
      status: "error",
      message: bookingErrorMessage(error),
      fieldErrors:
        error?.message === "note_required" ? { note: [bookingErrorMessage(error)] } : undefined,
    };
  }

  // The public catalog is cached: expire it so the profile appears or disappears right away. The
  // proxy's list of public profiles picks up a new one within seconds (lib/catalog/public-slugs.ts).
  updateTag("catalog");
  updateTag(`provider:${provider.slug}`);
  revalidatePath("/admin");
  await sendJobs(
    providerReviewed.create(
      { providerId, decision },
      // Same review twice (double click) → one email.
      { id: `${providerId}:${decision}:${provider.reviewed_at}` },
    ),
  );
  return { status: "success", message: `${provider.display_name} ${DONE[decision]}` };
}

/** Hide a review (the reason is optional, kept for the audit log) or restore it. */
export async function moderateReview(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const user = await getCurrentUser();
  if (user?.role !== "admin")
    return { status: "error", message: bookingErrorMessage({ message: "not_admin" }) };

  const parsed = moderateReviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    hidden: formData.get("hidden"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the form.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const { reviewId, hidden, reason } = parsed.data;

  const supabase = await createClient();
  const { data: review, error } = await supabase.rpc("moderate_review", {
    p_review_id: reviewId,
    p_hidden: hidden,
    p_reason: reason ?? "",
  });
  if (error || !review) return { status: "error", message: bookingErrorMessage(error) };

  // Reviews are part of the cached public profile.
  updateTag("catalog");
  revalidatePath("/admin/reviews");
  return {
    status: "success",
    message: `Review by ${review.author_name} ${hidden ? "hidden" : "restored"}.`,
  };
}
