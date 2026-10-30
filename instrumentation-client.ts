// Sentry in the browser. Off without NEXT_PUBLIC_SENTRY_DSN (local development, tests).
// The DSN is public by design: it only lets the browser send events to this project.
// No Session Replay: it records the page (and what clients type) and costs ~50 KB of JavaScript.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  tracesSampleRate: 0.1,
  // No names, emails, cookies or chat texts in error reports; the user id is enough to find a case.
  dataCollection: { userInfo: false, cookies: false, genAI: { inputs: false, outputs: false } },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
