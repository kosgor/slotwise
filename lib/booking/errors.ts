// Database functions raise short machine-readable codes (see the migration); this maps them to
// messages for people. Unknown errors get a generic message — never the raw database text.

export const BOOKING_ERROR_MESSAGES = {
  not_authenticated: "Please sign in to book.",
  service_not_found: "This service is no longer available.",
  own_service: "You cannot book your own service.",
  slot_unavailable: "This time is no longer available. Please choose another time.",
  slot_taken: "Someone has just booked this time. Please choose another one.",
  booking_not_found: "We could not find this booking.",
  not_cancellable: "This booking can no longer be cancelled.",
  too_late_to_cancel:
    "Free cancellation ended 24 hours before the session. Please contact the professional.",
  already_provider: "You already have a provider profile.",
  invalid_timezone: "Choose a valid time zone.",
  not_owner: "You can only change your own schedule.",
  too_many_holds:
    "You already have 3 bookings waiting for payment. Pay for one or release it, then try again.",
  payment_unavailable:
    "We could not open the payment page. Your time was not booked. Please try again in a moment.",
  hold_expired: "The 15 minutes to pay for this time are over. Please choose a time again.",
  hold_not_extendable: "This time cannot be held any longer. Please pay now or choose again.",
  plan_limit:
    "The Free plan includes up to 3 active services. Upgrade to Pro or turn off another service.",
  not_admin: "Only admins can do this.",
  review_not_found: "We could not find this review.",
  provider_not_found: "We could not find this provider.",
  invalid_transition: "This profile has already been reviewed. Refresh the page to see its status.",
  note_required: "Write a short reason: the provider sees it and knows what to fix.",
  ai_rate_limited: "That was a lot of requests in a minute. Please wait a moment and try again.",
  ai_daily_limit:
    "You have used today's AI requests. The allowance resets at midnight UTC; Pro providers get more.",
  ai_unavailable: "The AI assistant is not available right now. Please try again later.",
  document_limit: "You can keep up to 5 documents. Delete one to upload another.",
  document_not_found: "We could not find this document.",
} as const;

export type BookingErrorCode = keyof typeof BOOKING_ERROR_MESSAGES;

export function bookingErrorCode(
  error: { message?: string } | null | undefined,
): BookingErrorCode | null {
  const message = error?.message ?? "";
  return message in BOOKING_ERROR_MESSAGES ? (message as BookingErrorCode) : null;
}

export function bookingErrorMessage(error: { message?: string } | null | undefined): string {
  const code = bookingErrorCode(error);
  return code ? BOOKING_ERROR_MESSAGES[code] : "Something went wrong. Please try again.";
}
