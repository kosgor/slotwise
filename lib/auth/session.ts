import "server-only";

import { cache } from "react";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type Role = Database["public"]["Enums"]["user_role"];

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
};

/**
 * The signed-in user with their role, or null. getClaims() verifies the session's JWT (it does not
 * trust the cookie blindly); the role comes from the profiles table, which users cannot change.
 * cache(): several components in one request share a single lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", claims.sub)
    .maybeSingle();

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    role: profile?.role ?? "client",
    fullName: profile?.full_name ?? "",
  };
});

export function displayName(user: CurrentUser): string {
  return user.fullName || user.email.split("@")[0] || "Account";
}
