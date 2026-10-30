// Sample for the email preview server (npm run email:dev). Not used by the app.
import { ProviderReviewedEmail } from "../provider-emails";

export default function Preview() {
  return (
    <ProviderReviewedEmail
      name="Nina New"
      decision="reject"
      note="Please describe what a typical lesson looks like."
      profileUrl={null}
    />
  );
}
