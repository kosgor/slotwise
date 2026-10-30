// Sending email through Resend. Called only from background jobs, so a slow or failing email
// provider never delays a page or a webhook, and failures are retried by Inngest.
//
// Local development:
// * no RESEND_API_KEY → the email is logged instead of sent;
// * Resend without a verified domain delivers only to the account owner's address, so
//   EMAIL_DEV_TO sends every email there, with the real recipient in the subject.

import "server-only";

import { render, toPlainText } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";

let client: Resend | null = null;

export type EmailMessage = {
  to: string;
  subject: string;
  react: ReactElement;
  /** Same key → Resend sends only once (a retried job step does not email twice). */
  idempotencyKey: string;
};

export class PermanentEmailError extends Error {}

export async function sendEmail(message: EmailMessage): Promise<"sent" | "logged"> {
  const html = await render(message.react);
  const text = toPlainText(html);
  const redirect = process.env.EMAIL_DEV_TO;
  const to = redirect || message.to;
  const subject = redirect ? `[to ${message.to}] ${message.subject}` : message.subject;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] RESEND_API_KEY not set, not sending: "${subject}" → ${to}`);
    return "logged";
  }

  client ??= new Resend(key);
  const { error } = await client.emails.send(
    {
      from: process.env.EMAIL_FROM ?? "Slotwise <onboarding@resend.dev>",
      to,
      subject,
      html,
      text,
    },
    { idempotencyKey: message.idempotencyKey },
  );
  if (error) {
    // 4xx (bad address, unverified domain) will not get better on retry; 5xx and rate limits may.
    const status = "statusCode" in error ? Number(error.statusCode) : 0;
    const permanent = status >= 400 && status < 500 && status !== 429;
    const Failure = permanent ? PermanentEmailError : Error;
    throw new Failure(`Resend: ${error.name}: ${error.message}`);
  }
  return "sent";
}
