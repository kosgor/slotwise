import type { Role } from "@/lib/auth/session";

/**
 * Where a sign-in without an explicit destination lands ("/account" is the default ?next=): admins
 * in the back office, providers in their dashboard (that is what they come for; their own bookings
 * as a client stay one click away), clients in their bookings.
 */
export function homeFor(role: Role | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "provider") return "/dashboard";
  return "/account";
}
