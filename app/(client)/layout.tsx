import { SiteShell } from "@/components/layout/site-shell";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
