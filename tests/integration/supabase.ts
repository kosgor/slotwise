// Helpers for tests against the real Supabase project. The secret key is used only here (test
// tooling) to create throwaway users with a confirmed email and to clean up afterwards.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export const hasSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY);

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const adminClient = () =>
  createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, noSession);

export const anonClient = () =>
  createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, noSession);

export type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<Database>;
};

/** Creates a confirmed user and returns a client signed in as that user (role "authenticated"). */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `Test-${Math.random().toString(36).slice(2)}1`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error) throw error;
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, password, client };
}

/** Removes test users and everything they booked (bookings and payments use ON DELETE RESTRICT). */
export async function deleteTestUsers(users: TestUser[]) {
  const admin = adminClient();
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  const { data: bookings } = await admin.from("bookings").select("id").in("client_id", ids);
  const bookingIds = (bookings ?? []).map((b) => b.id);
  // Payments reference bookings (ON DELETE RESTRICT too): remove them first.
  if (bookingIds.length > 0) await admin.from("payments").delete().in("booking_id", bookingIds);
  await admin.from("bookings").delete().in("client_id", ids);
  // Provider profiles created by "become a provider" (services and schedules cascade).
  await admin.from("providers").delete().in("user_id", ids);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}
