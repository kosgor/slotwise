// Logical backup of the linked Supabase project: roles, schema and data as three SQL files in
// backups/<timestamp>/ (git-ignored — it contains user data). Restore steps: docs/operations.md.
//
// The free plan has daily backups but no point-in-time recovery and no download; this dump is the
// copy we control. Needs Docker for pg_dump, and either the Supabase CLI login (npx supabase login,
// linked project) or SUPABASE_DB_URL — the session pooler connection string, as in the nightly
// workflow .github/workflows/backup.yml.
// Run: npm run db:backup
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = join(process.env.BACKUP_DIR ?? "backups", stamp);
const source = process.env.SUPABASE_DB_URL
  ? ["--db-url", process.env.SUPABASE_DB_URL]
  : ["--linked"];
mkdirSync(dir, { recursive: true });

const parts: [string, string[]][] = [
  ["roles.sql", ["--role-only"]],
  ["schema.sql", []],
  // COPY instead of INSERT: much faster to restore.
  ["data.sql", ["--data-only", "--use-copy"]],
];

for (const [file, flags] of parts) {
  const path = join(dir, file);
  execFileSync("npx", ["supabase", "db", "dump", ...source, ...flags, "-f", path], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  console.log(`${path}: ${Math.round(statSync(path).size / 1024)} KB`);
}
console.log(`\nBackup written to ${dir}. Keep a copy outside this machine.`);
