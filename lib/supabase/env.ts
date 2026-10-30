// Public Supabase settings. Both values are safe in the browser: access is limited by GRANTs and RLS.
// Read with literal `process.env.NEXT_PUBLIC_*` so Next.js can inline them into client bundles.

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.example)");
  return url;
}

export function supabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (see .env.example)");
  return key;
}
