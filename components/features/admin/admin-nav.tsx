"use client";

import { FileClockIcon, LayoutDashboardIcon, MessageSquareIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Providers", icon: UsersIcon },
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquareIcon },
  { href: "/admin/audit", label: "Audit log", icon: FileClockIcon },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    // min-w-0: a grid item may not shrink below its content by default; without it the nav pushed
    // the page wider than a phone screen instead of scrolling its own row of links.
    <nav aria-label="Admin" className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-secondary text-secondary-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminsOnly() {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <h1 className="text-2xl font-semibold">Admins only</h1>
      <p className="mt-2 text-muted-foreground">Your account does not have access to this area.</p>
    </div>
  );
}
