// Inngest calls this endpoint to run job steps. Requests are signed (INNGEST_SIGNING_KEY in
// production); the local Dev Server is trusted while INNGEST_DEV=1.

import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
