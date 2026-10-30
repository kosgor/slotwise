import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client acting as the signed-in user (session from cookies) — Server Components,
 * Server Actions and Route Handlers. Create a new one per request; never share it.
 */
export async function createClient() {
  // Session checks compare token expiry with the current time. connection() keeps this out of any
  // prerender (including Next.js 16 session-aware prefetch shells): it runs only for real requests.
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies. That is fine: proxy.ts refreshes the session
          // before any page renders. Server Actions and Route Handlers can set cookies.
        }
      },
    },
  });
}
