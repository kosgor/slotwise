// Cancelling a booking as the signed-in user: cancel_booking() decides whether they may, then the
// money and the emails follow. Shared by the cancel form and the AI concierge's cancel tool.

import "server-only";

import { bookingCancelled } from "@/inngest/events";
import { sendJobs } from "@/lib/jobs";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

import { closeCheckout } from "./checkout";
import { refundBooking } from "./refunds";

type UserClient = Awaited<ReturnType<typeof createClient>>;
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export type CancelResult =
  | { ok: true; booking: BookingRow; refund: "none" | "issued" | "pending" }
  | { ok: false; error: { message?: string } | null };

export async function cancelAsUser(supabase: UserClient, bookingId: string): Promise<CancelResult> {
  const { data: before } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .maybeSingle();
  const { data: booking, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });
  if (error || !booking) return { ok: false, error };

  let refund: "none" | "issued" | "pending" = "none";
  if (booking.paid_cents > booking.refunded_cents) {
    // Refund right away so the client sees it confirmed; if Stripe is unreachable, the
    // reconciliation job (inngest/functions.tsx, every 5 minutes) retries.
    try {
      await refundBooking(createAdminClient(), bookingId);
      refund = "issued";
    } catch (e) {
      log.error("booking.refund_failed", e, { bookingId, retry: "reconciliation job" });
      refund = "pending";
    }
  } else if (before?.status === "pending_payment") {
    await closeCheckout(booking.stripe_checkout_session_id);
  }

  // Emails only for real bookings; releasing an unpaid hold is not news for anyone.
  if (before?.status === "confirmed") {
    const by = booking.cancelled_by === booking.client_id ? "client" : "provider";
    await sendJobs(bookingCancelled.create({ bookingId, by }, { id: `${bookingId}:cancelled` }));
  }
  return { ok: true, booking, refund };
}
