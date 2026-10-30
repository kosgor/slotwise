import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Header, <main id="main"> (target of the skip link) and footer — shared by public and account areas.
 * The admin area gets a header without the marketing links and no footer: it is a back office,
 * not the shop.
 */
export function SiteShell({
  children,
  variant = "site",
}: {
  children: React.ReactNode;
  variant?: "site" | "admin";
}) {
  return (
    <>
      <SiteHeader variant={variant} />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      {variant === "site" && <SiteFooter />}
    </>
  );
}
