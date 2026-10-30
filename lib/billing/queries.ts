import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type ProviderSubscription = Database["public"]["Tables"]["provider_subscriptions"]["Row"];

/** The signed-in provider's subscription row (RLS: only their own), or null = Free, never paid. */
export async function getOwnSubscription(providerId: string): Promise<ProviderSubscription | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_subscriptions")
    .select("*")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the subscription: ${error.message}`);
  return data;
}
