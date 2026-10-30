// Sample for the email preview server (npm run email:dev). Not used by the app.
import { BookingReminderEmail, SAMPLE_BOOKING } from "../booking-emails";

export default function Preview() {
  return <BookingReminderEmail booking={SAMPLE_BOOKING} />;
}
