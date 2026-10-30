// Which Supabase project a data script writes to. Scripts take `--env <file>` (default .env.local)
// and print the target before doing anything, so demo data never lands in the wrong project.
// Production keys live in .env.prod: Next.js never loads that name (it would load
// .env.production.local into a local `next build`), and .gitignore keeps it out of git.
import { existsSync } from "node:fs";

export type Target = { envFile: string; url: string; secret: string; projectRef: string };

export function loadTarget(argv = process.argv): Target {
  const i = argv.indexOf("--env");
  const envFile = i >= 0 ? argv[i + 1] : ".env.local";
  if (!envFile || !existsSync(envFile)) {
    console.error(`Env file not found: ${envFile ?? "(missing after --env)"}`);
    process.exit(1);
  }
  process.loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.error(`Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in ${envFile} first.`);
    process.exit(1);
  }
  const projectRef = new URL(url).hostname.split(".")[0]!;
  console.log(`Target: ${projectRef} (from ${envFile})`);
  return { envFile, url, secret, projectRef };
}
