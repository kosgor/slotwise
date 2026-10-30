// Sentry on the edge (edge runtime: proxy.ts).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  tracesSampleRate: 0.1,
  // No names, emails, cookies or chat texts in error reports; the user id is enough to find a case.
  dataCollection: { userInfo: false, cookies: false, genAI: { inputs: false, outputs: false } },
});
