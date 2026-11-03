import { expect, test } from "@playwright/test";

test.describe("catalog → filter → profile", () => {
  test("desktop: filter by category and format, then open a profile", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop sidebar filters");
    await page.goto("/pros");
    await expect(
      page.getByRole("heading", { level: 1, name: "Find a professional" }),
    ).toBeVisible();

    await page.getByLabel("Category").selectOption("yoga");
    await page.getByLabel("Format").selectOption("online");
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page).toHaveURL(/\/pros\?category=yoga&format=online$/);
    await expect(page.getByRole("status")).toHaveText("5 professionals found");
    await expect(page.getByRole("link", { name: "Remove filter: Yoga & Pilates" })).toBeVisible();

    await page.getByRole("link", { name: "Anna Whitfield" }).click();
    await expect(page).toHaveURL("/pros/anna-yoga");
    await expect(page.getByRole("heading", { level: 1, name: "Anna Whitfield" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Services and prices" })).toBeVisible();
  });

  test("sorting keeps the active filters", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar filters");
    // Start from a non-default sort: the bug only appeared when a sort was already in the URL.
    await page.goto("/pros?category=music&sort=price_asc");
    await page.getByLabel("Sort by").selectOption("price_desc");
    // Regression: a hidden "sort" input in the filters form used to override the select.
    await expect(page).toHaveURL(/category=music/);
    await expect(page).toHaveURL(/sort=price_desc/);
    await expect(page.getByLabel("Sort by")).toHaveValue("price_desc");
  });

  test("removing a filter chip updates the results", async ({ page }) => {
    await page.goto("/pros?category=massage&city=Leeds");
    await expect(page.getByRole("status")).toHaveText("1 professional found");
    await page.getByRole("link", { name: "Remove filter: Leeds" }).click();
    await expect(page).toHaveURL("/pros?category=massage");
    await expect(page.getByRole("status")).toHaveText("5 professionals found");
  });

  test("mobile: filters open in a sheet and close after applying", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile sheet filters");
    await page.goto("/pros");
    await page.getByRole("button", { name: "Filters" }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("City").selectOption("Edinburgh");
    await sheet.getByRole("button", { name: "Apply filters" }).click();

    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/city=Edinburgh/);
    await expect(page.getByRole("button", { name: "Filters 1 active" })).toBeVisible();
  });

  test("empty results explain what to do", async ({ page }) => {
    await page.goto("/pros?category=massage&format=online");
    await expect(page.getByRole("status")).toHaveText("0 professionals found");
    await expect(
      page.getByRole("heading", { name: "No professionals match these filters" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Clear all filters" }).click();
    await expect(page).toHaveURL("/pros");
  });

  test("pagination keeps filters and marks the current page", async ({ page }) => {
    await page.goto("/pros?format=online");
    await page.getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL("/pros?format=online&page=2");
    await expect(page.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test("landing search goes to filtered catalog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "What do you need help with?" }).fill("piano");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL("/pros?q=piano");
  await expect(page.getByRole("link", { name: "Daniel Brooks" })).toBeVisible();
});

test("a profile shows the newest reviews and loads the rest in place", async ({ page }) => {
  // Seed: Anna has 8 reviews, one of them hidden by moderation, so 7 are public.
  await page.goto("/pros/anna-yoga");
  const reviews = page.getByRole("region", { name: "Reviews" });
  await expect(reviews.getByText("7 reviews", { exact: true })).toBeVisible();
  await expect(
    reviews.getByRole("list", { name: "Reviews by rating" }).getByRole("listitem"),
  ).toHaveCount(5);
  await expect(reviews.getByRole("blockquote")).toHaveCount(5);

  await reviews.getByRole("button", { name: "Show 2 more reviews" }).click();
  await expect(reviews.getByRole("blockquote")).toHaveCount(7);
  await expect(reviews.getByRole("status")).toHaveText("2 more reviews loaded.");
  // Focus lands on the first new review, not back at the top of the page.
  await expect(reviews.getByRole("listitem").nth(5 + 5)).toBeFocused();
  await expect(reviews.getByRole("button")).toHaveCount(0);
});

test("unknown and non-approved providers return a real 404", async ({ page }) => {
  for (const path of ["/pros/zoe-coaching", "/pros/nobody-yoga", "/pros/nobody-yoga/book"]) {
    const response = await page.goto(path);
    // proxy.ts answers before the page streams, so the status is a real 404, not "200 + noindex".
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
  expect((await page.goto("/pros/anna-yoga"))?.status()).toBe(200);
});

test("first Tab focuses the skip link", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard navigation");
  await page.goto("/pricing");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("a new page opens at the very top; Back returns to where the visitor was", async ({
  page,
}) => {
  await page.goto("/");
  const footerLink = page.getByRole("contentinfo").getByRole("link", { name: "Pricing" });
  await footerLink.scrollIntoViewIfNeeded();
  const down = await page.evaluate(() => scrollY);
  expect(down).toBeGreaterThan(500);
  await footerLink.click();
  await expect(page).toHaveURL("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Not 65 (the header height): the top of the page, header included.
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
});

test("visitors are asked to apply from either plan", async ({ page }) => {
  await page.goto("/pricing");
  // Pro is bought from the dashboard, so it needs a provider profile first.
  await expect(page.getByRole("link", { name: "Start for free" })).toHaveAttribute(
    "href",
    "/account/become-provider",
  );
  await expect(page.getByRole("link", { name: "Try Pro" })).toHaveAttribute(
    "href",
    "/account/become-provider",
  );
  await expect(page.getByText("Your current plan")).toHaveCount(0);
});

test("an anchor link lands right under the sticky header", async ({ page }) => {
  await page.goto("/pricing");
  await page.getByRole("contentinfo").getByRole("link", { name: "FAQ" }).click();
  await expect(page).toHaveURL("/#faq");
  const gap = () =>
    page.evaluate(() => {
      const header = document.querySelector("header")!.getBoundingClientRect().bottom;
      return Math.round(document.getElementById("faq")!.getBoundingClientRect().top - header);
    });
  // Neither hidden behind the header nor a strip of the section above showing.
  await expect.poll(gap).toBe(0);
});

test("pricing toggle switches to yearly prices", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("£19", { exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Yearly billing" }).click();
  await expect(page.getByText("£16", { exact: true })).toBeVisible();
  await expect(page.getByText("£190 billed yearly")).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a plain form submission is redirected to the canonical URL", async ({ page }) => {
    // What a browser without JS sends: every field, including empty ones and defaults.
    const res = await page.request.get("/pros?q=&category=yoga&city=&format=&sort=recommended", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toMatch(/\/pros\?category=yoga$/);
  });

  test("catalog results are in the HTML for crawlers", async ({ page }) => {
    // Streamed (PPR) content is present in the HTML but needs JS to replace the skeleton
    // visually. Crawlers read the text; see docs/decisions/0004.
    const html = await (await page.request.get("/pros?category=yoga")).text();
    expect(html).toContain("Anna Whitfield");
    expect(html).toContain("7 professionals");
  });

  test("profile pages are fully visible", async ({ page }) => {
    await page.goto("/pros/anna-yoga");
    await expect(page.getByRole("heading", { level: 1, name: "Anna Whitfield" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Private class" })).toBeVisible();
    // The newest reviews are in the HTML; loading more needs JavaScript, so no dead button.
    const reviews = page.getByRole("region", { name: "Reviews" });
    await expect(reviews.getByRole("blockquote")).toHaveCount(5);
    await expect(reviews.getByRole("button")).toHaveCount(0);
  });

  test("scroll-reveal content is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "What people say" })).toBeVisible();
    await expect(page.getByText("I found a piano teacher")).toBeVisible();
  });
});

test("mobile menu opens, closes with Escape and returns focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile menu");
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Find a professional" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test.describe("broken provider photo", () => {
  for (const timing of ["before hydration", "after hydration"] as const) {
    test(`falls back to initials when the image fails ${timing}`, async ({ page }) => {
      if (timing === "before hydration") {
        // Every image request fails, including the one that starts while HTML is still loading.
        await page.route("**/_next/image**", (route) => route.abort());
        await page.goto("/pros/anna-yoga");
      } else {
        await page.goto("/pros/anna-yoga", { waitUntil: "domcontentloaded" });
        await page.route("**/_next/image**", (route) => route.abort());
        // Force a re-request by pointing the img at a new URL variant.
        await page
          .locator('img[alt="Portrait of Anna Whitfield"]')
          .evaluate((img: HTMLImageElement) => {
            img.srcset = "";
            img.src = "/_next/image?url=%2Fmissing.jpg&w=96&q=75";
          });
      }
      await expect(page.locator('img[alt="Portrait of Anna Whitfield"]')).toHaveCount(0);
      await expect(page.getByTestId("avatar-initials").first()).toHaveText("AW");
    });
  }
});

test("design system is reachable but hidden from users and search engines", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href="/design-system"]')).toHaveCount(0);
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/design-system");
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
