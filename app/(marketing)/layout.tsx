import { SiteShell } from "@/components/layout/site-shell";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}
