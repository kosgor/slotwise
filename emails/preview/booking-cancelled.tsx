// Sample for the email preview server (npm run email:dev). Not used by the app.
import { BookingCancelledEmail, SAMPLE_BOOKING } from "../booking-emails";

export default function Preview() {
  return (
    <BookingCancelledEmail
      booking={SAMPLE_BOOKING}
      audience="client"
      cancelledBy="provider"
      refund="£65"
    />
  );
}
