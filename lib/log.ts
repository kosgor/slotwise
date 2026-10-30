// Structured server logs: one JSON object per line, so a log platform (Vercel, Datadog, Axiom)
// can filter by event or booking id instead of grepping sentences. Errors also go to Sentry.
//
//   log.info("stripe.webhook", { type: event.type, eventId: event.id, result });
//   log.error("booking.refund_failed", error, { bookingId });
//
// Never log secrets, card data or message texts; ids are enough to find a case.

import * as Sentry from "@sentry/nextjs";

type Fields = Record<string, string | number | boolean | null | undefined>;
type Level = "info" | "warn" | "error";

function errorFields(error: unknown) {
  if (error instanceof Error) return { error: error.message, errorName: error.name };
  if (error && typeof error === "object" && "message" in error)
    return { error: String((error as { message: unknown }).message) };
  return error === undefined ? {} : { error: String(error) };
}

function write(level: Level, event: string, fields: Fields) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => write("info", event, fields),
  warn: (event: string, fields: Fields = {}) => write("warn", event, fields),
  error(event: string, error?: unknown, fields: Fields = {}) {
    write("error", event, { ...fields, ...errorFields(error) });
    Sentry.captureException(error instanceof Error ? error : new Error(event), {
      tags: { event },
      extra: fields,
    });
  },
};
