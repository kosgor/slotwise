// Inngest: background jobs that must survive failures — emails, reminders, refunds, expiring
// unpaid holds. Each step is retried on its own; a step that succeeded is not repeated.
//
// Locally the Inngest Dev Server (npm run jobs:dev) runs the jobs; INNGEST_DEV=1 in .env.local
// points the SDK at it. In production INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY are used instead.

import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "slotwise" });
