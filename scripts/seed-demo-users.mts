// Creates demo accounts for the three roles (client, provider, admin) in the linked Supabase
// project. Idempotent: existing accounts are reused. Run: npm run db:demo-users
//
// Uses the secret key (Admin API): users are created with a confirmed email and no email is sent.
// Addresses use example.com, a domain reserved for examples, so nothing ever reaches a real person.
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "SlotwiseDemo2026";

const DEMO_USERS = [
  { email: "demo-client@example.com", fullName: "Demo Client", role: "client" },
  // Takes over the seeded "Anna Whitfield" profile so the provider dashboard has real data.
  {
    email: "demo-provider@example.com",
    fullName: "Anna Whitfield",
    role: "provider",
    providerSlug: "anna-yoga",
  },
  { email: "demo-admin@example.com", fullName: "Demo Admin", role: "admin" },
] as const;

const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

for (const demo of DEMO_USERS) {
  let id = await findUserId(demo.email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: demo.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: demo.fullName },
    });
    if (error) throw error;
    id = data.user.id;
    console.log(`created ${demo.email}`);
  } else {
    console.log(`exists  ${demo.email}`);
  }

  // An existing account gets the current name too: the demo provider was renamed with the seed.
  const { error: metaError } = await admin.auth.admin.updateUserById(id, {
    user_metadata: { full_name: demo.fullName },
  });
  if (metaError) throw metaError;
  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: demo.role, full_name: demo.fullName })
    .eq("id", id);
  if (roleError) throw roleError;

  if ("providerSlug" in demo) {
    const { error } = await admin
      .from("providers")
      .update({ user_id: id })
      .eq("slug", demo.providerSlug);
    if (error) throw error;
  }
}

console.log(`\nDemo accounts ready. Password for all: ${DEMO_PASSWORD}`);
