// Flows with accounts, against the real Supabase dev project. Users are throwaway (created with the
// secret key, deleted afterwards). Without SUPABASE_SECRET_KEY in .env.local these tests skip.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";

import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  hasSecretKey,
  type TestUser,
} from "../integration/supabase";

test.skip(!hasSecretKey, "Needs SUPABASE_SECRET_KEY in .env.local to create test users");
test.describe.configure({ mode: "serial" });
test.use({ timezoneId: "Europe/Lisbon" });

/** Notices (saved, cancelled, approved…) appear as sonner toasts. */
const toasts = (page: Page) => page.locator("[data-sonner-toast]");

const users: TestUser[] = [];
// Removed profiles are detached from their account, so deleteTestUsers cannot find them.
const removedProviders: string[] = [];

test.afterAll(async () => {
  await deleteTestUsers(users);
  if (removedProviders.length > 0)
    await adminClient().from("providers").delete().in("id", removedProviders);
  // If the moderation test failed halfway, put the review back for everyone else.
  await adminClient()
    .from("reviews")
    .update({ hidden: false, hidden_reason: null })
    .eq("hidden_reason", "E2E moderation check");
});

const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
const stripeApi = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Tests that go through the real Stripe Checkout page need real webhooks (`npm run stripe:listen`
 * forwarding to the server under test) and Stripe must send the browser back to that same server
 * (NEXT_PUBLIC_SITE_URL is baked into the build).
 */
const REAL_STRIPE_HINT =
  "Set E2E_REAL_STRIPE=1, run stripe:listen to this server, and make NEXT_PUBLIC_SITE_URL point to it";
function realStripe(baseURL: string | undefined): boolean {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return Boolean(
    process.env.E2E_REAL_STRIPE &&
    hasStripe &&
    baseURL &&
    new URL(site).origin === new URL(baseURL).origin,
  );
}

/** The client's newest booking, read with the service role (what the webhook will look up). */
async function heldBooking(clientId: string) {
  const { data, error } = await adminClient()
    .from("bookings")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

/** POSTs an event to our webhook, signed with the same secret the server checks. */
function sendSignedWebhook(
  request: APIRequestContext,
  { type, object }: { type: string; object: Record<string, unknown> },
) {
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type,
    data: { object },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return request.post("/api/webhooks/stripe", {
    data: payload,
    headers: { "content-type": "application/json", "stripe-signature": signature },
  });
}

async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${label}: ${v.id}`)).toEqual([]);
}

async function signIn(page: Page, user: TestUser) {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Picks the first free time from the given day index on; returns the slot value. */
async function pickFirstFreeSlot(page: Page, slug: string, fromDay: number): Promise<string> {
  await page.goto(`/pros/${slug}/book`);
  const days = page.getByRole("group", { name: "2. Choose a day" }).getByRole("radio");
  const times = page.getByRole("group", { name: "3. Choose a time" }).getByRole("radio");
  await expect(days.first()).toBeAttached();
  let picked = false;
  for (let i = fromDay; i < fromDay + 12 && !picked; i++) {
    await days.nth(i).check({ force: true });
    await page.waitForResponse((r) => r.url().includes("/api/slots") && r.ok()).catch(() => {});
    picked = (await times.count()) > 0;
  }
  expect(picked, "no free day found").toBe(true);
  const time = (await times.first().getAttribute("value"))!;
  await times.first().check({ force: true });
  return time;
}

test("guest picks a time, signs in, comes back to it, is held for payment, the hold expires", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "One full run is enough");
  test.skip(!hasStripe, "Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env.local");
  test.setTimeout(90_000);
  const client = await createTestUser("e2e-client");
  users.push(client);

  // Start a few days ahead so the booking is more than 24 hours away (free cancellation).
  const time = await pickFirstFreeSlot(page, "sophie-tutoring", 3);

  // Not signed in: confirming sends us to sign in and back with the selection kept.
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(page, client);
  await expect(page).toHaveURL(/\/pros\/sophie-tutoring\/book\?/);
  // Reload: Next.js keeps the state of recently visited pages on client-side navigation, which
  // would hide a broken URL restore. A real session-expiry often comes back via a full page load.
  await page.reload();
  await expect(page.locator(`input[name="slot"][value="${time}"]`)).toBeChecked();

  // Stop at Stripe's door: Checkout is Stripe's page (paying on it: the next test).
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Stripe Checkout (test stub)</h1>" }),
  );
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);

  const booking = await heldBooking(client.id);
  expect(booking.status).toBe("pending_payment");
  expect(booking.price_cents).toBeGreaterThan(0);
  expect(booking.stripe_checkout_session_id).toMatch(/^cs_test_/);

  // Back on our payment page before paying: countdown and more time.
  await page.goto(`/account/bookings/${booking.id}`);
  await expect(page.getByRole("heading", { name: "Complete your payment" })).toBeVisible();
  await expectNoAxeViolations(page, "payment page");
  await page.getByRole("button", { name: "I need more time" }).click();
  await expect(toasts(page).filter({ hasText: /holding this time/ })).toBeVisible();

  // The client walks away. Stripe closes the session (here: right now, through the API) and sends
  // checkout.session.expired; the webhook re-reads the session from Stripe and sees it expired.
  await stripeApi().checkout.sessions.expire(booking.stripe_checkout_session_id!);
  const res = await sendSignedWebhook(page.request, {
    type: "checkout.session.expired",
    object: { id: booking.stripe_checkout_session_id, object: "checkout.session" },
  });
  expect(res.status()).toBe(200);
  // The page polls and announces the change without a reload.
  await expect(page.getByRole("heading", { name: "The time to pay has run out" })).toBeVisible();
  expect((await heldBooking(client.id)).status).toBe("expired");
});

test("pays on the real Stripe Checkout page, then cancels with a refund", async ({
  page,
  isMobile,
  baseURL,
}) => {
  test.skip(isMobile, "One full run is enough");
  // Needs `npm run stripe:listen` forwarding real webhooks to the server under test.
  test.skip(!realStripe(baseURL), REAL_STRIPE_HINT);
  test.setTimeout(120_000);
  const client = await createTestUser("e2e-payer");
  users.push(client);

  await page.goto("/login");
  await signIn(page, client);
  // This test runs against the dev server, which compiles a page on its first visit.
  await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
  await pickFirstFreeSlot(page, "sophie-tutoring", 5);
  await page.getByRole("button", { name: "Continue to payment" }).click();

  // Stripe's own page, test mode: card 4242…, any future date, any CVC.
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  // Several payment methods are offered (the account decides which); choose the card.
  const cardMethod = page.locator("[data-testid=card-accordion-item]");
  // isVisible() does not wait; the page is still loading here.
  const hasChoice = await cardMethod
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (hasChoice) await cardMethod.click();
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("E2E Payer");
  const zip = page.locator("#billingPostalCode");
  if (await zip.isVisible().catch(() => false)) await zip.fill("10001");
  await page.locator("button[type=submit]").click();

  // Back on our page: it waits for the webhook, then confirms.
  await expect(page).toHaveURL(/\/account\/bookings\/[^/]+\?paid=1/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Payment received/ })).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/account");
  const card = page.getByRole("article").filter({ hasText: "Confirmed" });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: /Cancel booking/ }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this booking?" });
  await expect(dialog).toContainText("full refund");
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  // Cancelling calls the Stripe Refund API before redirecting.
  await expect(page).toHaveURL(/\/account\?cancelled=1&refund=1/, { timeout: 30_000 });
  await expect(toasts(page).filter({ hasText: "A full refund is on its way" })).toBeVisible();

  // charge.refunded arrives through the webhook and is shown on the card.
  await expect
    .poll(async () => (await heldBooking(client.id)).refunded_cents, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.goto("/account?tab=cancelled");
  await expect(page.getByRole("article").filter({ hasText: /Refunded \$/ })).toHaveCount(1);
});

test("a forged webhook is rejected and changes nothing", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop is enough");
  // Without a webhook secret the route answers 500 "not configured" before checking anything.
  test.skip(!process.env.STRIPE_WEBHOOK_SECRET, "Needs STRIPE_WEBHOOK_SECRET in .env.local");
  const res = await page.request.post("/api/webhooks/stripe", {
    data: JSON.stringify({ id: "evt_forged", type: "checkout.session.completed", data: {} }),
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=forged" },
  });
  expect(res.status()).toBe(400);
});

test("clients cannot open provider and admin areas", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop is enough");
  const client = await createTestUser("e2e-roles");
  users.push(client);
  await page.goto("/login?next=/dashboard");
  await signIn(page, client);
  await expect(page.getByRole("heading", { name: "This area is for professionals" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();
});

test("a new provider applies, adds a service and sets working hours", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop is enough");
  // A long walk through the whole dashboard, with an accessibility scan of every page.
  test.setTimeout(90_000);
  const user = await createTestUser("e2e-provider");
  users.push(user);
  await page.goto("/login?next=/account/become-provider");
  await signIn(page, user);

  await page.getByLabel("Name shown to clients").fill("Paula Test");
  await page.getByLabel("Headline").fill("Test lessons for e2e");
  await page.getByLabel("Category").selectOption("music");
  await page.getByLabel("City").fill("Bath");
  await page.getByLabel("Online").check();
  await page.getByRole("button", { name: "Send application" }).click();

  await expect(page).toHaveURL(/\/dashboard\?applied=1/);
  await expect(page.getByText("Your profile is under review.")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Dashboard" })
    .getByRole("link", { name: "Services" })
    .click();
  await page.getByRole("button", { name: "Add service" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a service" });
  await dialog.getByLabel("Title").fill("Trial lesson");
  await dialog.getByLabel("Duration, minutes").fill("45");
  await dialog.getByLabel("Price, £").fill("30");
  await dialog.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByRole("heading", { name: "Trial lesson" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Dashboard" })
    .getByRole("link", { name: "Schedule" })
    .click();
  await page.getByRole("button", { name: "Add hours on Monday" }).click();
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Schedule saved.")).toBeVisible();

  // Overview: the setup checklist counts what is done (a service and hours; bio and approval not yet).
  await page.goto("/dashboard");
  const checklist = page.getByRole("button", { name: /^Get ready for bookings/ });
  await expect(checklist).toHaveAttribute("aria-expanded", "true");
  await expect(checklist).toContainText("2 of 4 done");
  await expect(page.getByRole("link", { name: /Tell clients about yourself/ })).toHaveAttribute(
    "href",
    "/dashboard/profile",
  );

  // Services: disabling stays on the page and says what happened.
  await page.goto("/dashboard/services");
  await page.getByRole("button", { name: "Disable Trial lesson" }).click();
  await expect(
    toasts(page).filter({ hasText: "“Trial lesson” is hidden from clients" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enable Trial lesson" }).click();
  await expect(toasts(page).filter({ hasText: "“Trial lesson” is bookable again" })).toBeVisible();

  // Bookings: the calendar starts open; the list searches in the database, in place.
  await page.goto("/dashboard/bookings");
  await expect(page.getByRole("button", { name: /^Calendar/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("status").filter({ hasText: "No bookings found." })).toBeVisible();
  await page.getByLabel("Search by client or service").fill("nobody");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("nobody");
  await expect(page.getByText("No bookings match “nobody”.")).toBeVisible();

  // Every dashboard page, as a provider (not the "for professionals" placeholder), meets WCAG AA.
  for (const path of [
    "/dashboard",
    "/dashboard/bookings",
    "/dashboard/schedule",
    "/dashboard/services",
    "/dashboard/profile",
    "/dashboard/documents",
    "/dashboard/billing",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page, path);
  }

  // The header pitches "For professionals" to visitors; a provider gets their dashboard there.
  const mainNav = page.getByRole("navigation", { name: "Main" });
  await expect(mainNav.getByRole("link", { name: "My dashboard" })).toBeVisible();
  await expect(mainNav.getByRole("link", { name: "For professionals" })).toHaveCount(0);

  // Crossing route groups mounts a new header; it must not flash the visitor version on the way.
  await page.evaluate(() => {
    const w = window as unknown as { visitorFlash: boolean };
    w.visitorFlash = false;
    new MutationObserver(() => {
      const header = document.querySelector("header");
      const links = [...(header?.querySelectorAll("a") ?? [])].map((a) => a.textContent?.trim());
      if (links.includes("For professionals") || links.includes("Sign in")) w.visitorFlash = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await mainNav.getByRole("link", { name: "Find a professional" }).click();
  await expect(page).toHaveURL("/pros");
  await mainNav.getByRole("link", { name: "My dashboard" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { visitorFlash: boolean }).visitorFlash),
  ).toBe(false);

  // Pricing knows who is looking: a provider on Free sees their plan and the way up.
  await page.goto("/pricing");
  const free = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Free" }) });
  const pro = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Pro" }) });
  await expect(free.getByText("Your current plan")).toBeVisible();
  await expect(pro.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute(
    "href",
    "/dashboard/billing",
  );

  // The menu leads with the dashboard; the sessions they booked as a client are named as such.
  await page.getByRole("button", { name: /^Account menu for/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem").first()).toHaveText("Provider dashboard");
  await expect(menu.getByRole("menuitem", { name: "Sessions I booked" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Next sign-in without a destination lands in the dashboard, not in the client bookings.
  await page.context().clearCookies();
  await page.goto("/login");
  await signIn(page, user);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an admin rejects with a reason, then approves: the profile goes public", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop is enough");
  test.setTimeout(90_000);
  const applicant = await createTestUser("e2e-applicant");
  const reviewer = await createTestUser("e2e-admin");
  users.push(applicant, reviewer);
  await adminClient().from("profiles").update({ role: "admin" }).eq("id", reviewer.id);

  // The applicant applies and adds a service (the catalog lists providers with one).
  // A unique first name: the slug comes from it ("rita12345-music"), and a removed profile frees its
  // slug, which the proxy may still remember for a minute (lib/catalog/public-slugs.ts).
  const name = `Rita${Date.now() % 100_000} Review`;
  await page.goto("/login?next=/account/become-provider");
  await signIn(page, applicant);
  await page.getByLabel("Name shown to clients").fill(name);
  await page.getByLabel("Headline").fill("Guitar for beginners");
  await page.getByLabel("Category").selectOption("music");
  await page.getByLabel("City").fill("Porto");
  await page.getByLabel("Online").check();
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page).toHaveURL(/\/dashboard\?applied=1/, { timeout: 30_000 });
  const { data: provider } = await adminClient()
    .from("providers")
    .select("id, slug")
    .eq("user_id", applicant.id)
    .single();
  await adminClient().from("services").insert({
    provider_id: provider!.id,
    title: "Guitar lesson",
    duration_min: 60,
    price_cents: 3500,
  });

  // Not public while pending.
  const visitor = await browser.newPage();
  expect((await visitor.goto(`/pros/${provider!.slug}`))!.status()).toBe(404);

  // The admin, in their own browser session.
  const adminPage = await (await browser.newContext()).newPage();
  await adminPage.goto("/login?next=/admin");
  await signIn(adminPage, reviewer);
  const application = adminPage.getByRole("article", { name });
  await expect(application).toBeVisible({ timeout: 30_000 });
  await expectNoAxeViolations(adminPage, "admin");

  // A rejection needs a reason; the applicant sees it.
  await application.getByRole("button", { name: `Reject ${name}` }).click();
  const dialog = adminPage.getByRole("dialog", { name: "Reject this application?" });
  await dialog.getByLabel("Reason").fill("Please describe what a first lesson looks like.");
  await dialog.getByRole("button", { name: "Reject application" }).click();
  await expect(toasts(adminPage).filter({ hasText: `${name} rejected` })).toBeVisible();
  await page.goto("/dashboard");
  // (Next.js has its own role="alert" route announcer, so filter by text.)
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your application needs changes" })
      .filter({ hasText: "Please describe what a first lesson looks like." }),
  ).toBeVisible();

  // Approved later from the list of all providers: public at once.
  const row = adminPage.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: `Approve ${name}` }).click();
  await expect(toasts(adminPage).filter({ hasText: `${name} approved` })).toBeVisible();
  // The proxy rechecks unknown profiles every few seconds.
  await expect
    .poll(async () => (await visitor.goto(`/pros/${provider!.slug}`))!.status(), {
      timeout: 15_000,
      intervals: [1_000, 2_000, 3_000],
    })
    .toBe(200);
  await expect(visitor.getByRole("heading", { level: 1, name })).toBeVisible();

  // Suspended without a reason (optional), then removed from there. The page stays where it is:
  // no redirect, no jump back to the top.
  const suspendButton = adminPage
    .getByRole("row", { name: new RegExp(name) })
    .getByRole("button", { name: `Suspend ${name}` });
  await suspendButton.scrollIntoViewIfNeeded();
  const scrolledTo = await adminPage.evaluate(() => scrollY);
  await suspendButton.click();
  const suspendDialog = adminPage.getByRole("dialog", { name: "Suspend this profile?" });
  await expect(suspendDialog.getByLabel("Reason (optional)")).toBeVisible();
  await suspendDialog.getByRole("button", { name: "Suspend profile" }).click();
  await expect(toasts(adminPage).filter({ hasText: `${name} suspended` })).toBeVisible();
  await expect(suspendDialog).toBeHidden();
  expect(scrolledTo).toBeGreaterThan(0);
  expect(await adminPage.evaluate(() => scrollY)).toBe(scrolledTo);

  // Removed for good: the profile leaves the catalog, the audit log has it, and the applicant's
  // account no longer has a provider area.
  removedProviders.push(provider!.id);
  await adminPage
    .getByRole("row", { name: new RegExp(name) })
    .getByRole("button", { name: `Remove ${name}` })
    .click();
  // The reason is optional: confirm right away.
  const removeDialog = adminPage.getByRole("dialog", { name: `Remove ${name} from Slotwise?` });
  await expect(removeDialog.getByLabel("Reason (optional)")).toBeVisible();
  await removeDialog.getByRole("button", { name: "Remove provider" }).click();
  // More work than other decisions (database, catalog cache, job queue): allow it more time.
  await expect(toasts(adminPage).filter({ hasText: `${name} removed` })).toBeVisible({
    timeout: 20_000,
  });
  // The notice is only a toast: the URL stays the same, so a refresh does not show it again.
  await expect(adminPage).not.toHaveURL(/decision=/);
  await adminPage.reload();
  await expect(adminPage.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
  await expect(toasts(adminPage)).toHaveCount(0);
  // Gone for visitors at once (the catalog cache is expired). The HTTP status turns 404 within a
  // minute: the proxy trusts a slug it saw recently (lib/catalog/public-slugs.ts), as on suspension.
  await expect
    .poll(
      async () => {
        await visitor.goto(`/pros/${provider!.slug}`);
        return visitor.getByRole("heading", { level: 1 }).innerText();
      },
      { timeout: 15_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe("Page not found");
  await adminPage.goto("/admin/audit");
  await expect(
    adminPage.getByRole("row").filter({ hasText: "Removed provider" }).filter({ hasText: name }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "This area is for professionals" })).toBeVisible();
});

test("a provider upgrades to Pro, then a renewal fails: past_due banner and Free limits", async ({
  page,
  isMobile,
  baseURL,
}) => {
  test.skip(isMobile, "Desktop is enough");
  test.skip(!realStripe(baseURL), REAL_STRIPE_HINT);
  test.setTimeout(240_000);
  const user = await createTestUser("e2e-pro");
  users.push(user);
  await page.goto("/login?next=/account/become-provider");
  await signIn(page, user);
  await page.getByLabel("Name shown to clients").fill("Petra Pro");
  await page.getByLabel("Headline").fill("Pro plan e2e");
  await page.getByLabel("Category").selectOption("music");
  await page.getByLabel("City").fill("Bath");
  await page.getByLabel("Online").check();
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page).toHaveURL(/\/dashboard\?applied=1/);

  // Fill the Free plan: 3 active services (written directly, the UI is tested elsewhere).
  const admin = adminClient();
  const { data: provider } = await admin
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();
  await admin.from("services").insert(
    [1, 2, 3].map((n) => ({
      provider_id: provider!.id,
      title: `Service ${n}`,
      duration_min: 60,
      price_cents: 3000,
    })),
  );

  const addService = async (title: string) => {
    await page.goto("/dashboard/services");
    await page.getByRole("button", { name: "Add service" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a service" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Duration, minutes").fill("30");
    await dialog.getByLabel("Price, £").fill("20");
    await dialog.getByRole("button", { name: "Add service" }).click();
    return dialog;
  };
  const blocked = await addService("Fourth on Free");
  await expect(blocked.getByRole("alert")).toContainText("Free plan includes up to 3");

  // A Stripe test clock lets the test jump a month ahead to the renewal. The customer must live on
  // the clock from the start, so it is created here; the app reuses it (ensureCustomer).
  const stripe = stripeApi();
  const startedAt = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: startedAt });
  const customer = await stripe.customers.create({
    email: user.email,
    test_clock: clock.id,
    metadata: { provider_id: provider!.id },
  });
  await admin
    .from("provider_subscriptions")
    .insert({ provider_id: provider!.id, stripe_customer_id: customer.id });

  // Upgrade on Stripe's page with a working card.
  await page.goto("/dashboard/billing");
  await page.getByRole("button", { name: "Upgrade to Pro" }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const cardMethod = page.locator("[data-testid=card-accordion-item]");
  if (
    await cardMethod
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
  )
    await cardMethod.click();
  await page.locator("#cardNumber").fill("4242 4242 4242 4242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Petra Pro");
  const zip = page.locator("#billingPostalCode");
  if (await zip.isVisible()) await zip.fill("10001");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/dashboard\/billing\?checkout=success/, { timeout: 60_000 });
  // The page refreshes until the webhook has switched the plan.
  await expect(page.getByRole("heading", { name: "Current plan: Pro" })).toBeVisible({
    timeout: 30_000,
  });
  const allowed = await addService("Fourth on Pro");
  await expect(allowed).toBeHidden();
  await expect(page.getByRole("heading", { name: "Fourth on Pro" })).toBeVisible();

  // The card stops working, then a month passes: the renewal is declined.
  const { data: sub } = await admin
    .from("provider_subscriptions")
    .select("stripe_subscription_id")
    .eq("provider_id", provider!.id)
    .single();
  const failing = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
    customer: customer.id,
  });
  await stripe.subscriptions.update(sub!.stripe_subscription_id!, {
    default_payment_method: failing.id,
  });
  await stripe.testHelpers.testClocks.advance(clock.id, {
    frozen_time: startedAt + 32 * 24 * 60 * 60,
  });

  await expect
    .poll(
      async () =>
        (
          await admin
            .from("provider_subscriptions")
            .select("status")
            .eq("provider_id", provider!.id)
            .single()
        ).data?.status,
      { timeout: 90_000 },
    )
    .toBe("past_due");
  await page.goto("/dashboard");
  const banner = page.getByRole("alert").filter({ hasText: "Your Pro payment failed" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Fix payment" })).toHaveAttribute(
    "href",
    "/dashboard/billing",
  );
  const blockedAgain = await addService("Fifth while past due");
  await expect(blockedAgain.getByRole("alert")).toContainText("Free plan includes up to 3");

  // Deleting the clock deletes its customer and subscription in Stripe. It can be deleted only
  // once it has finished advancing.
  await expect
    .poll(async () => (await stripe.testHelpers.testClocks.retrieve(clock.id)).status, {
      timeout: 60_000,
    })
    .toBe("ready");
  await stripe.testHelpers.testClocks.del(clock.id);
});

test("sign-up form validates in the browser before sending anything", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByLabel("Password").blur();
  await expect(page.getByText(/Enter a valid email address/)).toBeVisible();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  // Errors are linked to their fields for screen readers.
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
});

test("signed-in areas have no WCAG 2.2 AA violations", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop is enough");
  test.setTimeout(60_000);
  const user = await createTestUser("e2e-a11y");
  users.push(user);
  await page.goto("/login?next=/account");
  await signIn(page, user);
  await expect(page).toHaveURL(/\/account/);
  for (const path of [
    "/account",
    "/account/become-provider",
    "/account/assistant",
    "/dashboard",
    "/dashboard/billing",
    "/admin",
    "/dashboard/documents",
  ]) {
    await page.goto(path);
    // Wait for the real content (streamed after the session check), not for "network idle":
    // Next.js keeps prefetching links in the background.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
  }
});

test("an admin hides a review, restores it, and both decisions are in the audit log", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop is enough");
  test.setTimeout(90_000);
  const admin = await createTestUser("e2e-moderator");
  users.push(admin);
  await adminClient().from("profiles").update({ role: "admin" }).eq("id", admin.id);

  await page.goto("/login?next=/admin/dashboard");
  await signIn(page, admin);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // Charts have a text alternative: a summary and a table.
  await expect(page.getByRole("figure", { name: "Bookings per day" })).toBeVisible();
  await expectNoAxeViolations(page, "admin dashboard");

  // Dashboard: the AI section starts folded.
  const aiToggle = page.getByRole("button", { name: /^AI/ });
  await expect(aiToggle).toHaveAttribute("aria-expanded", "false");
  await aiToggle.click();
  await expect(page.getByRole("figure", { name: "AI spend per day" })).toBeVisible();

  // Providers: the table section starts open, folds, and a stat tile opens it again.
  await page.goto("/admin");
  const providersToggle = page.getByRole("button", { name: /^All providers/ });
  await expect(providersToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: "All providers", exact: true })).toBeVisible();
  await providersToggle.click();
  await expect(page.getByRole("region", { name: "All providers", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /Awaiting review/ }).click();
  await expect(providersToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/status=pending/);
  await expect(page.getByRole("region", { name: "All providers", exact: true })).toBeVisible();

  await page.goto("/admin/reviews");
  await expectNoAxeViolations(page, "admin reviews");
  const dateHeader = page.getByRole("columnheader", { name: /Date/ });
  await expect(dateHeader).toHaveAttribute("aria-sort", "descending");

  // The newest visible review.
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: /^Hide review by/ }) })
    .first();
  const author = (await row.getByRole("button", { name: /^Hide review by/ }).textContent())!
    .replace(/^Hide\s*review by\s*/, "")
    .trim();
  await row.getByRole("button", { name: /^Hide review by/ }).click();
  const dialog = page.getByRole("dialog", { name: "Hide this review?" });
  // The reason is optional; this one should end up in the audit log.
  await expect(dialog.getByLabel("Reason (optional)")).not.toHaveAttribute("required");
  await dialog.getByLabel("Reason (optional)").fill("E2E moderation check");
  await dialog.getByRole("button", { name: "Hide review" }).click();
  await expect(toasts(page).filter({ hasText: `Review by ${author} hidden` })).toBeVisible();
  await expect(page).not.toHaveURL(/moderated=/);

  // Server-side search and filter, in place: only this author's hidden reviews.
  await page.getByRole("link", { name: "Hidden", exact: true }).click();
  await expect(page).toHaveURL(/status=hidden/);
  await page.getByLabel("Search by author or text").fill(author);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(author);
  const results = page.getByRole("region", { name: "Reviews" }).getByRole("row");
  await expect(results.filter({ hasText: "E2E moderation check" })).toHaveCount(1);

  await page
    .getByRole("button", { name: `Restore review by ${author}` })
    .first()
    .click();
  await expect(toasts(page).filter({ hasText: `Review by ${author} restored` })).toBeVisible();
  // Back on the same filter and search; the restored review has left the "Hidden" list.
  await expect(page).toHaveURL(/status=hidden/);
  await expect(results.filter({ hasText: "E2E moderation check" })).toHaveCount(0);

  await page.goto("/admin/audit");
  await expectNoAxeViolations(page, "audit log");
  await expect(page.getByRole("row").filter({ hasText: "Hid review" }).first()).toContainText(
    "E2E moderation check",
  );
  await expect(page.getByRole("row").filter({ hasText: "Restored review" }).first()).toBeVisible();

  // Filter and search run in the database, in place: only hides with this reason are left.
  const log = page.getByRole("region", { name: "Audit log" });
  await page.getByRole("link", { name: "Hid review", exact: true }).click();
  await expect(page).toHaveURL(/action=hide/);
  await page.getByLabel("Search by name, reason or admin").fill("E2E moderation check");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("E2E moderation check");
  await expect(log.getByRole("row").filter({ hasText: "Restored review" })).toHaveCount(0);
  await expect(log.getByRole("row").filter({ hasText: "Hid review" }).first()).toContainText(
    "E2E moderation check",
  );
});

test("the concierge on a profile asks a guest to sign in, keeping focus in place", async ({
  page,
}) => {
  await page.goto("/pros/hannah-yoga");
  const open = page.getByRole("button", { name: "Ask the AI concierge" });
  await open.focus();
  await page.keyboard.press("Enter");
  const signIn = page.getByRole("link", { name: "Sign in" }).last();
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/login?next=%2Fpros%2Fhannah-yoga");
  // Focus moved to the region that replaced the button, not to the top of the page.
  await expect(page.locator(":focus")).toContainText("to chat with the concierge");
});
