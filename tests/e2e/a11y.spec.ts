import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/pros",
  "/pros?category=yoga&format=online",
  "/pros?category=massage&format=online", // empty state
  "/pros/anna-yoga",
  "/pros/anna-yoga/book",
  "/pricing",
  "/design-system",
  "/this-page-does-not-exist",
  "/login",
  "/signup",
  "/forgot-password",
];

// Automated checks catch only part of WCAG issues; manual keyboard and screen reader passes are still required.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`axe (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`no WCAG 2.2 AA violations on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        // Let scroll-reveal animations finish so axe measures final colors, not mid-fade opacity.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(800);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();

        const summary = results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
        }));
        expect(summary).toEqual([]);
      });
    }
  });
}

// WCAG 1.4.10 Reflow: content fits 320 CSS px (= 1280 px at 400% zoom) without horizontal scrolling.
test.describe("reflow at 320px", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const path of PAGES) {
    test(`no horizontal scroll on ${path}`, async ({ page, isMobile }) => {
      test.skip(isMobile, "Viewport is set explicitly; run once");
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
