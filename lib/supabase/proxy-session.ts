// Session refresh for proxy.ts, following @supabase/ssr's middleware pattern: cookies written by a
// token refresh go both onto the request (so the page rendered next sees the new session) and onto
// the response (so the browser stores it). Refresh tokens are single-use — skipping this step is
// what makes users get "logged out" in the middle of an action.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

export type SessionResult = {
  /** Response carrying refreshed cookies. Build redirects with `withSession` to keep them. */
  response: NextResponse;
  userId: string | null;
  /**
   * The "user_role" claim of the verified token (custom_access_token_hook), or null when absent —
   * a token issued before the hook was enabled. A routing hint only, never a permission.
   */
  role: string | null;
  /** Copies refreshed auth cookies and headers onto another response (redirect, rewrite). */
  withSession: (other: NextResponse) => NextResponse;
};

export async function refreshSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  const extraHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        // Cache-Control and similar: a response that sets session cookies must never be cached.
        Object.assign(extraHeaders, headers);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifies the access token and refreshes it if expired. Do not put code between client
  // creation and this call (per @supabase/ssr docs).
  const { data } = await supabase.auth.getClaims();
  const userId = (data?.claims?.sub as string | undefined) ?? null;
  const role = (data?.claims?.user_role as string | undefined) ?? null;

  const withSession = (other: NextResponse) => {
    for (const cookie of response.cookies.getAll()) other.cookies.set(cookie);
    for (const [key, value] of Object.entries(extraHeaders)) other.headers.set(key, value);
    return other;
  };

  return { response, userId, role, withSession };
}
