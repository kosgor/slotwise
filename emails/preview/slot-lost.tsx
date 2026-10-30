// Sample for the email preview server (npm run email:dev). Not used by the app.
import { SAMPLE_BOOKING, SlotLostEmail } from "../booking-emails";

export default function Preview() {
  return <SlotLostEmail booking={SAMPLE_BOOKING} amount="£65" />;
}
