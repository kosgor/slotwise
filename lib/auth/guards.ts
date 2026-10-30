import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser, type Role } from "./session";

/**
 * Server-side access checks for pages. proxy.ts already sends visitors without a session to
 * /login (optimistic, cookie-based); these checks are the real ones and also cover roles.
 * Data access is limited by RLS on top of that — hiding a page is never the only protection.
 */
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export function hasRole(user: CurrentUser, roles: Role[]): boolean {
  return roles.includes(user.role);
}
