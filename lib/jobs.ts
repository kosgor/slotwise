// Sending events to Inngest from request handlers.

import "server-only";

import { inngest } from "@/inngest/client";
import { log } from "@/lib/log";

type Sendable = Parameters<typeof inngest.send>[0];

/**
 * Best effort: the user's action (booking, cancelling) has already succeeded in the database, so a
 * job queue that is down must not turn it into an error. What a lost event would have done is
 * covered elsewhere: refunds by the reconciliation job, confirmations are visible in the account.
 */
export async function sendJobs(events: Sendable): Promise<boolean> {
  try {
    await inngest.send(events);
    return true;
  } catch (error) {
    log.error("jobs.send_failed", error);
    return false;
  }
}
