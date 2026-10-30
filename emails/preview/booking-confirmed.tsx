// Sample for the email preview server (npm run email:dev). Not used by the app.
import { BookingConfirmedEmail, SAMPLE_BOOKING } from "../booking-emails";

export default function Preview() {
  return <BookingConfirmedEmail booking={SAMPLE_BOOKING} />;
}
