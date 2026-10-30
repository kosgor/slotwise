// Where email confirmation, password reset and Google sign-in links land.
// Supabase redirects here with a one-time ?code=…; we exchange it for a session (PKCE: the
// matching code verifier is in this browser's cookies, so a stolen link alone is useless).

import { NextResponse, type NextRequest } from "next/server";

import { homeFor } from "@/lib/auth/home";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // The default destination: each role starts on its own home page (as after a password sign-in).
      let target = next;
      if (next === "/account" && data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();
        target = homeFor(profile?.role);
      }
      return NextResponse.redirect(new URL(target, origin));
    }
  }

  // Expired or already used link, opened in another browser, or the provider returned an error.
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
