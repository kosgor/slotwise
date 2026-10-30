// Sample for the email preview server (npm run email:dev). Not used by the app.
import { RefundIssuedEmail, SAMPLE_BOOKING } from "../booking-emails";

export default function Preview() {
  return <RefundIssuedEmail booking={SAMPLE_BOOKING} amount="£65" />;
}
