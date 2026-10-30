"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };
type Props = { items: readonly NavItem[]; className?: string; onNavigate?: () => void };

/**
 * The current path is URL data: on routes whose URL is unknown at build time (/account/bookings/[id])
 * reading it outside <Suspense> would block prerendering. The prerendered shell shows the links
 * without the "current page" mark; the mark streams in.
 */
export function NavLinks(props: Props) {
  return (
    <Suspense fallback={<NavList {...props} pathname={null} />}>
      <CurrentNavLinks {...props} />
    </Suspense>
  );
}

function CurrentNavLinks(props: Props) {
  return <NavList {...props} pathname={usePathname()} />;
}

function NavList({ items, className, onNavigate, pathname }: Props & { pathname: string | null }) {
  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {items.map((item) => {
        const active =
          pathname !== null && !item.href.includes("#") && pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active && "text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
