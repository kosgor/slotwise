// Client for public, cacheable reads (catalog, schedules). No cookies and no session: it always acts
// as the anonymous role, so its results are the same for every visitor and safe to put in
// "use cache". Never use it for anything user-specific.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

export function createPublicClient() {
  return createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
