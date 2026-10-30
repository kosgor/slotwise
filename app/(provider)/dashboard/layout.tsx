import { Suspense } from "react";

import { PastDueBanner } from "@/components/features/billing/past-due-banner";
import { DashboardNav } from "@/components/features/dashboard/dashboard-nav";
import { SiteShell } from "@/components/layout/site-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[200px_1fr]">
        <DashboardNav />
        <div className="min-w-0 space-y-6">
          {/* Reads the session: streamed in, so it never delays the page itself. */}
          <Suspense fallback={null}>
            <PastDueBanner />
          </Suspense>
          {children}
        </div>
      </div>
    </SiteShell>
  );
}
