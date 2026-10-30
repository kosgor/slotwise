// Emails to providers about their profile review.

import { ActionLink, EmailLayout, Paragraph, siteHref } from "./layout";

const COPY = {
  approve: {
    subject: "Your Slotwise profile is live",
    heading: "You are in the catalog",
    body: "Your profile has been approved. Clients can now find you and book your services.",
    link: "Open my dashboard",
  },
  reject: {
    subject: "Your Slotwise application needs changes",
    heading: "Your application needs a few changes",
    body: "We could not approve your profile yet. Here is what to fix:",
    link: "Edit my profile",
  },
  suspend: {
    subject: "Your Slotwise profile is paused",
    heading: "Your profile is paused",
    body: "Your profile is hidden from the catalog for now.",
    link: "Open my dashboard",
  },
  remove: {
    subject: "Your Slotwise provider profile was removed",
    heading: "Your provider profile was removed",
    body: "Your profile is no longer on Slotwise. Upcoming bookings were cancelled and clients get a full refund. Your account stays: you can still book sessions, and apply again with a new profile.",
    link: "Open my account",
  },
} as const;

export type ReviewDecision = keyof typeof COPY;

export const providerReviewSubject = (decision: ReviewDecision) => COPY[decision].subject;

export function ProviderReviewedEmail({
  name,
  decision,
  note,
  profileUrl,
}: {
  name: string;
  decision: ReviewDecision;
  note: string | null;
  /** Public profile, for approvals. */
  profileUrl: string | null;
}) {
  const copy = COPY[decision];
  return (
    <EmailLayout preview={copy.body} heading={copy.heading}>
      <Paragraph>Hi {name},</Paragraph>
      <Paragraph>{copy.body}</Paragraph>
      {/* Rejections always carry a note (their body leads into it); for the rest it is optional. */}
      {note && (
        <Paragraph>
          {decision !== "reject" && "Reason: "}
          <strong>{note}</strong>
        </Paragraph>
      )}
      {decision === "approve" && profileUrl && (
        <Paragraph>
          Your public page: <a href={profileUrl}>{profileUrl}</a>
        </Paragraph>
      )}
      <ActionLink
        href={siteHref(
          decision === "reject"
            ? "/dashboard/profile"
            : decision === "remove"
              ? "/account"
              : "/dashboard",
        )}
      >
        {copy.link}
      </ActionLink>
    </EmailLayout>
  );
}
