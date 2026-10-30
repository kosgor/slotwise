import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/catalog/types";
import { catalogHref } from "@/lib/catalog/query";

const LINK_CLASS =
  "inline-flex min-h-6 items-center rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-3">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Book independent professionals with real availability and clear prices.
          </p>
        </div>
        <nav aria-label="Categories">
          <h2 className="mb-3 text-sm font-semibold">Categories</h2>
          <ul className="space-y-2">
            {CATEGORIES.map((category) => (
              <li key={category}>
                <Link href={catalogHref({ category })} className={LINK_CLASS}>
                  {CATEGORY_LABELS[category]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Product">
          <h2 className="mb-3 text-sm font-semibold">Product</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/pros" className={LINK_CLASS}>
                Find a professional
              </Link>
            </li>
            <li>
              <Link href="/pricing" className={LINK_CLASS}>
                Pricing for professionals
              </Link>
            </li>
            <li>
              <Link href="/#faq" className={LINK_CLASS}>
                FAQ
              </Link>
            </li>
          </ul>
        </nav>
        {/* /design-system and /llms.txt are deliberately not linked: one is a developer showcase,
            the other is for language models. Both are reachable by direct URL. */}
      </div>
      <div className="border-t">
        {/* Static year: Cache Components forbids `new Date()` in prerendered output. */}
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
          © 2026 Slotwise.
        </p>
      </div>
    </footer>
  );
}
