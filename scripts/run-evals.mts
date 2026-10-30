// Manual evals for the AI concierge: sends every case in evals/questions.json to the running app's
// /api/chat as a throwaway client account (created for the run, deleted after it, with its
// conversations) and checks tools and answers. Not part of CI — it costs real model calls (free
// tier: a few per minute) and the answers are not deterministic.
//
// Run: npm run dev (in another terminal), then npm run evals [-- case-id ...]
// Needs: GOOGLE_GENERATIVE_AI_API_KEY and SUPABASE_SECRET_KEY in .env.local and, for the provider
// cases, evals/documents/anna-policies.md uploaded as demo-provider.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

process.loadEnvFile(".env.local");

type Case = {
  id: string;
  question: string;
  provider?: string;
  tools?: string[];
  include?: string[];
  exclude?: string[];
  dontKnow?: boolean;
};

const BASE = process.env.EVALS_URL ?? "http://localhost:3000";
// example.com is reserved for examples: no email ever reaches a real person.
const EMAIL = `evals-${Date.now()}@example.com`;
const PASSWORD = randomUUID();
// claim_ai_request allows 6 requests a minute; stay under it.
const PAUSE_MS = 11_000;
const DONT_KNOW =
  /(don't|do not) know|not sure|no information|couldn't find|could not find|isn't mentioned|not mentioned|ask (anna|the provider)/i;

const { cases } = JSON.parse(readFileSync("evals/questions.json", "utf8")) as { cases: Case[] };
const only = process.argv.slice(2);
const selected = only.length ? cases.filter((c) => only.includes(c.id)) : cases;

// A fresh account per run: its own empty history and its own daily allowance (30 requests).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: "Evals Client" },
});
if (created.error) {
  console.error(`Could not create the evals account: ${created.error.message}`);
  process.exit(1);
}
const userId = created.data.user.id;
// Deleting the user removes its conversations and messages (on delete cascade); its ai_usage
// rows stay with user_id = null, so the spend still shows on the admin dashboard.
const cleanUp = () => admin.auth.admin.deleteUser(userId);

// Sign in like the browser does; @supabase/ssr writes the session into these cookies.
const jar = new Map<string, string>();
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  },
);
const { error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (error) {
  console.error(`Could not sign in as ${EMAIL}: ${error.message}.`);
  await cleanUp();
  process.exit(1);
}
const cookie = [...jar, ["tz", "Europe/London"]]
  .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
  .join("; ");

async function ask(c: Case) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      id: randomUUID(),
      message: { id: randomUUID(), role: "user", parts: [{ type: "text", text: c.question }] },
      trigger: "submit-message",
      providerSlug: c.provider,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  // UI message stream: server-sent events, one JSON chunk per "data:" line.
  let text = "";
  const tools = new Set<string>();
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    const chunk = JSON.parse(line.slice(6)) as { type: string; delta?: string; toolName?: string };
    if (chunk.type === "text-delta") text += chunk.delta ?? "";
    if (chunk.type === "tool-input-available" && chunk.toolName) tools.add(chunk.toolName);
  }
  return { text: text.trim(), tools: [...tools] };
}

function check(c: Case, answer: { text: string; tools: string[] }): string[] {
  const problems: string[] = [];
  if (c.tools && !c.tools.some((t) => answer.tools.includes(t)))
    problems.push(`expected a tool of [${c.tools.join(", ")}], got [${answer.tools.join(", ")}]`);
  for (const re of c.include ?? [])
    if (!new RegExp(re, "i").test(answer.text)) problems.push(`missing /${re}/`);
  for (const re of c.exclude ?? [])
    if (new RegExp(re, "i").test(answer.text)) problems.push(`must not match /${re}/`);
  if (c.dontKnow && !DONT_KNOW.test(answer.text)) problems.push("should say it does not know");
  return problems;
}

let passed = 0;
for (const [i, c] of selected.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  try {
    const answer = await ask(c);
    const problems = check(c, answer);
    if (problems.length === 0) passed++;
    console.log(`${problems.length ? "FAIL" : "pass"}  ${c.id}  [${answer.tools.join(", ")}]`);
    console.log(`      ${answer.text.replace(/\s+/g, " ").slice(0, 240)}`);
    for (const p of problems) console.log(`      ✗ ${p}`);
  } catch (e) {
    console.log(`ERROR ${c.id}  ${(e as Error).message}`);
  }
}
console.log(`\n${passed}/${selected.length} passed`);
const { error: deleteError } = await cleanUp();
if (deleteError) console.error(`Could not delete ${EMAIL}: ${deleteError.message}`);
process.exit(passed === selected.length ? 0 : 1);
