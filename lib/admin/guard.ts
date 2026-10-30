import "server-only";

import { requireUser } from "@/lib/auth/guards";

/**
 * The signed-in admin, or null for any other role. Pages show "Admins only" for null; the data is
 * protected anyway — RLS returns only the user's own rows and admin functions re-check the role.
 */
export async function getAdmin(next: string) {
  const user = await requireUser(next);
  return user.role === "admin" ? user : null;
}
