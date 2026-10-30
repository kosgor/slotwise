"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { bookingConfirmed } from "@/inngest/events";
import { safeNext } from "@/lib/auth/redirect";
import { sendJobs } from "@/lib/jobs";
import { log } from "@/lib/log";
import { isStripeConfigured } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { bookSlotSchema, cancelBookingSchema } from "@/lib/validation/booking";

import { cancelAsUser } from "./cancel";
import { createBookingCheckout, openCheckoutUrl } from "./checkout";
import { bookingErrorCode, bookingErrorMessage, type BookingErrorCode } from "./errors";

export type BookingActionState = {
  status: "idle" | "error" | "success";
  code?: BookingErrorCode | "invalid_input";
  message?: string;
};

const failure = (error: { message?: string } | null): BookingActionState => ({
  status: "error",
  code: bookingErrorCode(error) ?? undefined,
  message: bookingErrorMessage(error),
});

/**
 * Creates a booking through book_slot(): the database checks the schedule, takes the price from
 * the service and guarantees no overlap. A paid service becomes a 15-minute hold and the client
 * goes to Stripe Checkout; a free one is confirmed at once.
 */
export async function bookSlot(input: {
  serviceId: string;
  startsAt: string;
}): Promise<BookingActionState> {
  const parsed = bookSlotSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", code: "invalid_input", message: "Choose a time first." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return failure({ message: "not_authenticated" });

  const { data: booking, error } = await supabase.rpc("book_slot", {
    p_service_id: parsed.data.serviceId,
    p_starts_at: parsed.data.startsAt,
  });
  if (error || !booking) return failure(error);

  revalidatePath("/account");
  if (booking.status === "confirmed") {
    await sendJobs(
      bookingConfirmed.create({ bookingId: booking.id }, { id: `${booking.id}:confirmed` }),
    );
    redirect(`/account?booked=${booking.id}`);
  }

  let checkoutUrl: string;
  try {
    if (!isStripeConfigured()) throw new Error("STRIPE_SECRET_KEY is not set");
    checkoutUrl = await createBookingCheckout(booking);
  } catch (e) {
    log.error("booking.checkout_failed", e, { bookingId: booking.id });
    // Do not leave a hold nobody can pay for.
    await supabase.rpc("cancel_booking", { p_booking_id: booking.id });
    return failure({ message: "payment_unavailable" });
  }
  // redirect() works with external URLs: the browser goes to Stripe's page.
  redirect(checkoutUrl);
}

export async function cancelBooking(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = cancelBookingSchema.safeParse({ bookingId: formData.get("bookingId") });
  if (!parsed.success)
    return { status: "error", code: "invalid_input", message: "Unknown booking." };
  const { bookingId } = parsed.data;

  const result = await cancelAsUser(await createClient(), bookingId);
  if (!result.ok) return failure(result.error);
  const refund = { none: "", issued: "&refund=1", pending: "&refund=pending" }[result.refund];

  revalidatePath("/account");
  revalidatePath("/dashboard/bookings");
  // Redirect instead of returning a message: the cancelled booking leaves the "Upcoming" list, and
  // the dialog that would show the message disappears with it. The page shows a banner instead.
  const back = safeNext(formData.get("returnTo"), "/account").split("?")[0];
  redirect(`${back}?cancelled=1${refund}`);
}

/** Back to the Stripe page of a hold that is still open. */
export async function resumePayment(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = cancelBookingSchema.safeParse({ bookingId: formData.get("bookingId") });
  if (!parsed.success) return failure({ message: "booking_not_found" });

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("status, expires_at, stripe_checkout_session_id")
    .eq("id", parsed.data.bookingId)
    .maybeSingle();
  if (!booking) return failure({ message: "booking_not_found" });
  const live =
    booking.status === "pending_payment" &&
    booking.expires_at !== null &&
    new Date(booking.expires_at) > new Date();
  if (!live || !booking.stripe_checkout_session_id) return failure({ message: "hold_expired" });

  let url: string | null = null;
  try {
    url = await openCheckoutUrl(booking.stripe_checkout_session_id);
  } catch (e) {
    log.error("booking.checkout_reopen_failed", e, { bookingId: parsed.data.bookingId });
    return failure({ message: "payment_unavailable" });
  }
  if (!url) return failure({ message: "hold_expired" });
  redirect(url);
}

/** "I need more time" on the payment page. */
export async function extendHold(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = cancelBookingSchema.safeParse({ bookingId: formData.get("bookingId") });
  if (!parsed.success) return failure({ message: "booking_not_found" });
  const supabase = await createClient();
  const { error } = await supabase.rpc("extend_payment_hold", {
    p_booking_id: parsed.data.bookingId,
  });
  if (error) return failure(error);
  revalidatePath(`/account/bookings/${parsed.data.bookingId}`);
  return { status: "success", message: "We are holding this time for you a little longer." };
}
