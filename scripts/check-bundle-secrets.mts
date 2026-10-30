// Failure drill "key in the browser": after `next build`, search everything the browser can
// download (.next/static) for secret keys. Fails (exit 1) on any hit; runs in CI after the build.
//
// Two checks: well-known secret prefixes, and the actual values of server-only variables from the
// environment (so a renamed or custom secret is caught too).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI passes variables directly.
}

const ROOT = ".next/static";

const PATTERNS: [string, RegExp][] = [
  ["Stripe secret key", /\bsk_(test|live)_[A-Za-z0-9]{10,}/],
  ["Stripe restricted key", /\brk_(test|live)_[A-Za-z0-9]{10,}/],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{10,}/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/],
  ["Resend API key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/],
  ["Inngest signing key", /\bsignkey-(prod|test|branch)-[A-Za-z0-9]{10,}/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

// Server-only variables: their values must never appear in browser files.
const SERVER_ONLY = [
  "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "TOOL_APPROVAL_SECRET",
  "RESEND_API_KEY",
  "INNGEST_SIGNING_KEY",
  "INNGEST_EVENT_KEY",
  "SENTRY_AUTH_TOKEN",
];
const values = SERVER_ONLY.flatMap((name) => {
  const v = process.env[name];
  return v && v.length >= 12 ? [[name, v] as const] : [];
});

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|css|html|json|map|txt)$/.test(name)) yield path;
  }
}

let scanned = 0;
const hits: string[] = [];
try {
  for (const file of files(ROOT)) {
    scanned++;
    const text = readFileSync(file, "utf8");
    for (const [label, re] of PATTERNS) if (re.test(text)) hits.push(`${label} in ${file}`);
    for (const [name, value] of values)
      if (text.includes(value)) hits.push(`value of ${name} in ${file}`);
  }
} catch {
  console.error(`No ${ROOT}: run npm run build first.`);
  process.exit(1);
}

if (hits.length) {
  console.error(`Secrets found in browser files:\n${hits.map((h) => `  ✗ ${h}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `No secrets in ${scanned} browser files (${PATTERNS.length} patterns, ${values.length} server-only values checked).`,
);
