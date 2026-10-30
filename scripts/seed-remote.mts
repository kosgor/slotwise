// Applies supabase/seed.sql to a remote project. The Supabase CLI writes to whatever project is
// linked, so this checks first that the link matches the env file and stops if not.
// Run: npm run db:seed:remote (dev, .env.local) or npm run db:seed:remote -- --env .env.prod
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { loadTarget } from "./target-env.mts";

const { projectRef, envFile } = loadTarget();

const refFile = "supabase/.temp/project-ref";
const linked = existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : "";
if (linked !== projectRef) {
  console.error(
    `The Supabase CLI is linked to ${linked || "nothing"}, but ${envFile} points to ${projectRef}.\n` +
      `Run: npx supabase link --project-ref ${projectRef}`,
  );
  process.exit(1);
}

execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", "supabase/seed.sql"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log(`Seed applied to ${projectRef}.`);
