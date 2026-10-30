"use client";

import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ShieldIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import type { Role } from "@/lib/auth/session";

export function UserMenuDropdown({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: Role;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-44" aria-label={`Account menu for ${name}`}>
          <UserIcon aria-hidden="true" />
          <span className="hidden truncate sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* The admin account is a staff account: it reviews, it does not book or sell. */}
        {role === "admin" ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldIcon aria-hidden="true" />
              Admin
            </Link>
          </DropdownMenuItem>
        ) : (
          <>
            {/* A provider works in the dashboard; the sessions they booked with others come second,
                named so they are not mistaken for their clients' bookings. */}
            {role === "provider" && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard">
                  <LayoutDashboardIcon aria-hidden="true" />
                  Provider dashboard
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/account">
                <CalendarDaysIcon aria-hidden="true" />
                {role === "provider" ? "Sessions I booked" : "My bookings"}
              </Link>
            </DropdownMenuItem>
            {role !== "provider" && (
              <DropdownMenuItem asChild>
                <Link href="/account/become-provider">
                  <SparklesIcon aria-hidden="true" />
                  Become a provider
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        {/* A form, not a link: signing out changes state, so it must not be a GET a crawler could follow. */}
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
