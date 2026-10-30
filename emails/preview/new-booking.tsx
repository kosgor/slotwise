// Sample for the email preview server (npm run email:dev). Not used by the app.
import { NewBookingEmail, SAMPLE_BOOKING } from "../booking-emails";

export default function Preview() {
  return <NewBookingEmail booking={SAMPLE_BOOKING} />;
}
