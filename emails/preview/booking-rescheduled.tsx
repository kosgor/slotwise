// Sample for the email preview server (npm run email:dev). Not used by the app.
import { BookingRescheduledEmail, SAMPLE_BOOKING } from "../booking-emails";

export default function Preview() {
  return (
    <BookingRescheduledEmail
      booking={{ ...SAMPLE_BOOKING, when: "Thursday 5 November 2026, 14:00 (London time)" }}
      previousWhen={SAMPLE_BOOKING.when}
      audience="client"
      movedBy="provider"
    />
  );
}
