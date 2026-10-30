// Which database a Stripe object belongs to. Local, staging and production share one test-mode
// Stripe account, and Stripe sends every event of the account to every webhook endpoint: without a
// tag, production would receive a staging payment, find no such booking, answer 500 and get the
// event retried for days. Every object the app creates carries this tag in its metadata, and the
// webhook skips objects tagged for another database (lib/stripe/webhook.ts). Local and staging use
// the same dev project, so they share a tag, which is right: the booking is in that database.

/** Metadata key on Checkout sessions, payments and subscriptions. */
export const DB_TAG_KEY = "slotwise_db";

/** The Supabase project ref ("irsx…" from https://irsx….supabase.co), or the host for a local one. */
export function currentDbTag(): string {
  return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost").hostname.split(
    ".",
  )[0]!;
}

/** Metadata to spread into every Stripe object the webhook will hear about. */
export function dbTagMetadata(): Record<string, string> {
  return { [DB_TAG_KEY]: currentDbTag() };
}

/**
 * True when the object is tagged for another database. Untagged objects were created before the
 * tag existed (dev only: production starts with an empty database) and are handled as before.
 */
export function isForeign(metadata: Record<string, string> | null | undefined, dbTag: string) {
  const tag = metadata?.[DB_TAG_KEY];
  return tag !== undefined && tag !== dbTag;
}
