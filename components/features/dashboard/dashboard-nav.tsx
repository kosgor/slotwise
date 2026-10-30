"use client";

import {
  CalendarDaysIcon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDaysIcon },
  { href: "/dashboard/schedule", label: "Schedule", icon: ClockIcon },
  { href: "/dashboard/services", label: "Services", icon: ListIcon },
  { href: "/dashboard/profile", label: "Profile", icon: UserRoundIcon },
  { href: "/dashboard/documents", label: "Documents", icon: FileTextIcon },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCardIcon },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    // min-w-0: lets the grid item shrink to the screen; its row of links scrolls instead.
    <nav aria-label="Dashboard" className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
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
