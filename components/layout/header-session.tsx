"use client";

import Link from "next/link";

import { MobileNav } from "@/components/layout/mobile-nav";
import { navItemsFor } from "@/components/layout/nav-items";
import { NavLinks } from "@/components/layout/nav-links";
import { UserMenuDropdown } from "@/components/layout/user-menu-dropdown";
import { useViewer } from "@/components/layout/viewer";
import { Button } from "@/components/ui/button";

// The header parts that depend on who is signed in. They read the viewer remembered in the browser
// (components/layout/viewer.tsx), so a header that mounts on navigation shows the right links and
// menu at once instead of the visitor version first.

export function HeaderNav() {
  return <NavLinks items={navItemsFor(useViewer()?.role)} />;
}

export function HeaderMobileNav() {
  return <MobileNav items={navItemsFor(useViewer()?.role)} />;
}

export function AccountMenu() {
  const viewer = useViewer();
  return viewer ? <UserMenuDropdown {...viewer} /> : <SignInLink />;
}

function SignInLink() {
  return (
    <Button asChild variant="ghost">
      <Link href="/login">Sign in</Link>
    </Button>
  );
}
