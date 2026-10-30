# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Slotwise** is a booking platform for independent professionals (tutors, coaches, trainers). It has three roles: client, provider and admin. The folder is still named `ai-chat-platform-ui`, but the package is `slotwise`. The plan and current stage are in `docs/PLAN.md`, and the architecture decisions (ADRs) are in `docs/decisions/`. README, docs and ADRs are written in Russian. Code, comments and Cursor rules are in English.

@AGENTS.md — this is Next.js 16 (`cacheComponents`, `proxy.ts` instead of middleware, `"use cache"`). Check `node_modules/next/dist/docs/` before using a Next.js API.

## Commands

```bash
npm run dev                 # http://localhost:3000
npm run typecheck           # next typegen && tsc --noEmit
npm run lint                # ESLint
npm run format:check        # Prettier (npm run format to fix)
npm test                    # Vitest: tests/unit + tests/rls (migrations run in PGlite, no external DB)
npm run test:integration    # Vitest against the real Supabase dev project (needs SUPABASE_SECRET_KEY)
npm run test:e2e            # next build + Playwright on a production server at :3100
```

- Single Vitest file or test: `npx vitest run tests/unit/booking-slots.test.ts` or `npx vitest run -t "test name"`.
- Single Playwright spec, using an existing build: `npx playwright test tests/e2e/catalog.spec.ts --project=desktop`. Set `E2E_PORT=3000` to run against a dev server that is already running. Tests that need accounts are skipped when `SUPABASE_SECRET_KEY` is missing.
- After a schema change, run `npm run db:types` to regenerate `lib/supabase/database.types.ts`. Never edit that file by hand.
- `supabase/seed.sql` is generated from `lib/catalog/seed-data.ts` by `npm run db:seed`. CI fails if the generated file differs from the committed one.
- Local services, each in its own terminal: `npm run stripe:listen` (prints `STRIPE_WEBHOOK_SECRET`), `npm run jobs:dev` (Inngest, :8288) and `npm run email:dev` (email preview, :3200). Setup steps are in `docs/setup-stripe.md`.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, format:check, test, the seed diff check, integration and e2e.

## Architecture

There is one Next.js app and no separate backend (ADR 0001). Supabase provides Postgres, Auth and Storage. Stripe and Inngest call into the app through signed endpoints.

- **Route groups:** `app/(marketing)` holds the public pages, the `/pros` catalog and booking. The other groups are `(auth)`, `(client)/account`, `(provider)/dashboard` and `(admin)/admin`. API routes live in `app/api/` (`webhooks/stripe`, `inngest`, `slots`, `bookings/[id]`).
- **Access control has three layers.** First, `proxy.ts` makes an optimistic cookie check that redirects to `/login?next=`, enforces canonical `/pros` URLs and returns a 404 for non-public slugs. Second, the layouts and pages call `lib/auth/guards.ts` to check roles. Third, RLS in Postgres is the real boundary. Hiding UI is never the protection.
- **Supabase clients (`lib/supabase/`):**
  - `server.ts`: the user session, read from cookies.
  - `browser.ts`: the client for the browser.
  - `public.ts`: the anon role, used for cached catalog reads.
  - `admin.ts`: the secret key, which bypasses RLS. It is used only in webhooks, Inngest jobs and Stripe customer creation, and it is marked `server-only`.
- **Domain modules in `lib/<domain>/`:** `actions.ts` holds Server Actions (`"use server"`, Zod from `lib/validation/`). `queries.ts` and `repository.ts` hold reads. Pure logic such as `rules.ts`, `slots.ts` and `calendar.ts` has unit tests. The catalog is read through `lib/catalog/repository.ts`, which uses `"use cache"`, `cacheLife` and `cacheTag("catalog")` and wraps `source.ts`. Pages import only from the repository.
- **Critical writes go through SQL functions** (ADR 0006): `book_slot`, `cancel_booking`, `apply_as_provider` and the provider review functions. The database checks price, schedule and permissions. Slot rules are duplicated in `lib/booking/rules.ts` and in `book_slot()`, so change both. The tests in `tests/rls` check that they agree.
- **Payments** (ADR 0009): a booking holds its slot for 15 minutes, then the client pays through Stripe Checkout. The webhook in `app/api/webhooks/stripe/route.ts` verifies the signature against the raw body, then calls `lib/stripe/webhook.ts`. Each webhook effect is one `stripe_*` SQL function that records `event.id` in `stripe_events` and changes the data in the same transaction, so a repeated event is a no-op. The handler re-reads the object from the Stripe API and never trusts the event body. Payment state changes only through webhooks, never from the success page. Refund amounts in the database change only through `charge.refunded`.
- **Background jobs** (ADR 0010): `inngest/functions.tsx` handles emails (Resend, React Email templates in `emails/`), refunds, reminders and reconciliation. Code queues jobs through `lib/jobs.ts` `sendJobs()`, which is best effort and never fails the user action. Job event ids come from the booking or Stripe event ids, so retries do not create duplicates.
- **Time** (ADR 0008): values are stored as `timestamptz` in UTC. Provider schedules are stored in the provider's local time. The UI converts with `@date-fns/tz` (`lib/datetime.ts`, `lib/viewer-timezone.ts`). Money is stored as integer cents.
- **RLS tests (`tests/rls/db.ts`):** they run every migration and the seed in PGlite, with stub versions of `auth`, `storage` and the `anon`, `authenticated` and `service_role` roles. A new migration must work there too.
- **AI (stage 4, in progress):** `lib/ai/` and the migration `20261023000000_ai_concierge.sql`. The app uses the Vercel AI SDK v7 and pgvector.

## Rules (from `.cursor/rules/project.mdc`)

- **Working mode:** propose a short plan first (files, risks, tests) and wait for approval. Make one small change at a time and don't refactor outside the task. Never invent library APIs.
- **Git and publishing: never.** Do not run git commands that change history or publish anything: `init`, `add`, `commit`, `push`, `remote`, `tag`, `gh`, or a deploy. Reading is fine (`status`, `diff`, `log`). When something needs to go to git or a host, give the owner the exact commands and they run them by hand. This holds even if a request seems to ask for it.
- **Security:**
  - Secrets stay on the server, and keys never use `NEXT_PUBLIC_`.
  - Every mutation re-checks permissions on the server and validates its input with Zod.
  - Never trust ids or prices from the browser. Checkout amounts come from the booking row.
  - Post-login redirects go only through `safeNext` (`lib/auth/redirect.ts`).
- **Migrations:**
  - Add a new file in `supabase/migrations/` and never edit an old one.
  - Every new table gets RLS enabled, explicit policies and explicit `GRANT`s to `anon` and `authenticated` in the same migration. Tables are not exposed automatically, so a table without a GRANT is unreachable from the Data API.
- **AI:**
  - Tools that change data need explicit user confirmation in the UI.
  - Tools run with the current user's permissions.
  - Answers about provider policies must cite the source chunk or say "I don't know".
  - Log the tokens and cost of every model call into `ai_usage`.
- **UI:**
  - Every data view handles the loading, empty, error and success states.
  - Design mobile first.
  - Use the design tokens (`lib/design/tokens.ts`, `app/globals.css`). Never hard-code colors or spacing.
  - Build on shadcn/ui on top of Radix (`components/ui/`). Use CSS for scroll animations and Motion for state changes (ADR 0005).
- **Tests:**
  - Pure logic and webhook handling get Vitest tests. Critical user paths get Playwright tests.
  - A test must fail when the code is broken. Verify that once by breaking the code.
