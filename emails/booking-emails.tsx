// All booking emails. Each template takes ready-to-show strings (times already formatted in a
// named time zone), so templates stay dumb and can be previewed with sample data
// (npm run email:dev).

import { ActionLink, Details, EmailLayout, Paragraph, siteHref } from "./layout";

export type EmailBooking = {
  serviceTitle: string;
  /** "Tuesday, 27 October 2026, 10:00 (Central European Time)" */
  when: string;
  duration: string;
  price: string;
  providerName: string;
  clientName: string;
};

const rows = (b: EmailBooking, withName: "provider" | "client"): [string, string][] => [
  ["Service", b.serviceTitle],
  ["When", b.when],
  ["Duration", b.duration],
  withName === "provider" ? ["With", b.providerName] : ["Client", b.clientName],
  ["Price", b.price],
];

export function BookingConfirmedEmail({ booking }: { booking: EmailBooking }) {
  return (
    <EmailLayout
      preview={`${booking.serviceTitle} with ${booking.providerName}, ${booking.when}`}
      heading="Your booking is confirmed"
    >
      <Paragraph>
        Hi {booking.clientName}, your payment went through and the time is yours.
      </Paragraph>
      <Details rows={rows(booking, "provider")} />
      <Paragraph>
        Free cancellation with a full refund is possible until 24 hours before the session.
      </Paragraph>
      <ActionLink href={siteHref("/account")}>View my bookings</ActionLink>
    </EmailLayout>
  );
}

export function NewBookingEmail({ booking }: { booking: EmailBooking }) {
  return (
    <EmailLayout
      preview={`${booking.clientName} booked ${booking.serviceTitle}, ${booking.when}`}
      heading="You have a new booking"
    >
      <Paragraph>{booking.clientName} has booked and paid for a session with you.</Paragraph>
      <Details rows={rows(booking, "client")} />
      <ActionLink href={siteHref("/dashboard/bookings")}>Open my bookings</ActionLink>
    </EmailLayout>
  );
}

export function BookingReminderEmail({ booking }: { booking: EmailBooking }) {
  return (
    <EmailLayout
      preview={`Tomorrow: ${booking.serviceTitle} with ${booking.providerName}`}
      heading="Your session is tomorrow"
    >
      <Paragraph>Hi {booking.clientName}, a reminder about your upcoming session.</Paragraph>
      <Details rows={rows(booking, "provider")} />
      <ActionLink href={siteHref("/account")}>View booking</ActionLink>
    </EmailLayout>
  );
}

export function BookingCancelledEmail({
  booking,
  audience,
  cancelledBy,
  refund,
}: {
  booking: EmailBooking;
  audience: "client" | "provider";
  /** "platform": the provider was removed from Slotwise. */
  cancelledBy: "client" | "provider" | "platform";
  /** Formatted refund amount, when money goes back to the client. */
  refund: string | null;
}) {
  const who =
    cancelledBy === "platform"
      ? "We had to cancel this booking: the professional is no longer on Slotwise."
      : cancelledBy === audience
        ? "You cancelled this booking."
        : cancelledBy === "client"
          ? `${booking.clientName} cancelled this booking.`
          : `${booking.providerName} had to cancel this booking.`;
  return (
    <EmailLayout
      preview={`Cancelled: ${booking.serviceTitle}, ${booking.when}`}
      heading="Booking cancelled"
    >
      <Paragraph>{who}</Paragraph>
      <Details rows={rows(booking, audience === "client" ? "provider" : "client")} />
      {audience === "client" && refund && (
        <Paragraph>
          A refund of {refund} is on its way to your card. Banks usually show it within 5–10
          business days.
        </Paragraph>
      )}
      <ActionLink href={siteHref(audience === "client" ? "/pros" : "/dashboard/bookings")}>
        {audience === "client" ? "Find another time" : "Open my bookings"}
      </ActionLink>
    </EmailLayout>
  );
}

export function BookingRescheduledEmail({
  booking,
  previousWhen,
  audience,
  movedBy,
}: {
  /** With the new time in `when`. */
  booking: EmailBooking;
  /** The old time, formatted like `when`. */
  previousWhen: string;
  audience: "client" | "provider";
  movedBy: "client" | "provider";
}) {
  const who =
    movedBy === audience
      ? "You moved this booking to a new time."
      : movedBy === "client"
        ? `${booking.clientName} moved their booking to a new time.`
        : `${booking.providerName} moved your booking to a new time.`;
  const [service, , ...rest] = rows(booking, audience === "client" ? "provider" : "client");
  return (
    <EmailLayout
      preview={`Moved: ${booking.serviceTitle}, now ${booking.when}`}
      heading="Booking moved"
    >
      <Paragraph>{who}</Paragraph>
      <Details rows={[service!, ["New time", booking.when], ["Was", previousWhen], ...rest]} />
      {audience === "client" && (
        <Paragraph>
          The payment stays with the booking. Free cancellation is possible until 24 hours before
          the new time.
        </Paragraph>
      )}
      <ActionLink href={siteHref(audience === "client" ? "/account" : "/dashboard/bookings")}>
        {audience === "client" ? "View my bookings" : "Open my bookings"}
      </ActionLink>
    </EmailLayout>
  );
}

export function RefundIssuedEmail({ booking, amount }: { booking: EmailBooking; amount: string }) {
  return (
    <EmailLayout
      preview={`Refund of ${amount} for ${booking.serviceTitle}`}
      heading="Refund issued"
    >
      <Paragraph>
        Hi {booking.clientName}, we have refunded {amount} for {booking.serviceTitle} with{" "}
        {booking.providerName} ({booking.when}). Banks usually show it within 5–10 business days.
      </Paragraph>
      <ActionLink href={siteHref("/account?tab=cancelled")}>View my bookings</ActionLink>
    </EmailLayout>
  );
}

export function SlotLostEmail({ booking, amount }: { booking: EmailBooking; amount: string }) {
  return (
    <EmailLayout
      preview={`We could not keep ${booking.when} for you — full refund`}
      heading="We could not keep this time for you"
    >
      <Paragraph>
        Hi {booking.clientName}, your payment arrived after the 15-minute hold had ended, and
        someone else had already booked {booking.when}. We are refunding the full {amount}.
      </Paragraph>
      <ActionLink href={siteHref("/pros")}>Choose another time</ActionLink>
    </EmailLayout>
  );
}

// Sample data for the React Email preview server.
export const SAMPLE_BOOKING: EmailBooking = {
  serviceTitle: "Private yoga class",
  when: "Tuesday 3 November 2026, 10:00 (London time)",
  duration: "1 h",
  price: "£65",
  providerName: "Anna Whitfield",
  clientName: "Alex Client",
};
