import { NextResponse, type NextRequest } from "next/server";

import { canonicalCatalogUrl } from "@/lib/catalog/canonical";
import { isPublicProviderSlug } from "@/lib/catalog/public-slugs";
import { refreshSession } from "@/lib/supabase/proxy-session";

// Areas that need a signed-in user. This is an optimistic check (cookie present and valid) that
// saves a render; the real access control is the role check in each area's layout and RLS.
const PROTECTED = ["/account", "/dashboard", "/admin"];
// The admin account is a staff account: it works in /admin and can still sign in and out.
const ADMIN_PATHS = ["/admin", "/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

const under = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Runs before every page render:
 * 1. Refreshes the Supabase session (keeps users signed in).
 * 2. /account, /dashboard, /admin without a session → redirect to /login?next=…
 * 3. Admins anywhere outside the admin area (including "/") → /admin, before anything renders.
 * 4. /pros: one canonical URL per catalog view (308).
 * 5. /pros/[slug]: unknown or non-public profiles get a real 404 before the page streams.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, userId, role, withSession } = await refreshSession(request);

  if (!userId && under(pathname, PROTECTED)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return withSession(NextResponse.redirect(login));
  }

  // Page loads only: a POST here is a Server Action, which answers with data, not a page.
  if (role === "admin" && request.method === "GET" && !under(pathname, ADMIN_PATHS)) {
    return withSession(NextResponse.redirect(new URL("/admin", request.url)));
  }

  if (pathname === "/pros") {
    // In-app navigations already use canonical URLs (CleanGetForm, catalogHref), so in practice
    // this fires for full page loads: forms submitted without JS, hand-edited or external links.
    const target = canonicalCatalogUrl(request.nextUrl.searchParams);
    return target
      ? withSession(NextResponse.redirect(new URL(target, request.url), 308))
      : response;
  }

  const profile = /^\/pros\/([^/]+)(\/book)?$/.exec(pathname);
  if (profile && !(await isPublicProviderSlug(profile[1]!))) {
    // Rewrite (not redirect) to a path no route matches: the browser keeps the URL it asked for
    // and Next.js renders app/not-found.tsx with HTTP 404.
    return withSession(NextResponse.rewrite(new URL("/404", request.url)));
  }

  return response;
}

export const config = {
  // Every page and Server Action, but not static files, images or Next.js internals — nor the
  // endpoints Stripe and Inngest call: they carry no user session and verify their own signatures.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|fonts/|robots.txt|sitemap.xml|llms.txt|opengraph-image|api/webhooks/|api/inngest).*)",
  ],
};
