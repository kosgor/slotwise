import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/layout/logo";
import { AccountMenu, HeaderMobileNav, HeaderNav } from "@/components/layout/header-session";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SessionViewer } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";

/**
 * The public site's header, or the admin area's: logo, "Admin" and the account menu. Admins never
 * see the public one — proxy.ts sends them to /admin from any other page.
 */
export function SiteHeader({ variant = "site" }: { variant?: "site" | "admin" }) {
  const site = variant === "site";
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Logo href={site ? "/" : "/admin"} />
        {site ? (
          <nav aria-label="Main" className="hidden md:block">
            <HeaderNav />
          </nav>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">Admin</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {/* The header is static HTML. The session is read once, in Suspense, and the links and the
              account menu follow it from the browser (components/layout/viewer.tsx). */}
          <AccountMenu />
          <Suspense fallback={null}>
            <SessionViewer />
          </Suspense>
          {site && (
            <>
              <Button asChild className="hidden md:inline-flex">
                <Link href="/pros">Book a session</Link>
              </Button>
              <HeaderMobileNav />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
