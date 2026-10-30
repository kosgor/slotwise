import { AdminNav } from "@/components/features/admin/admin-nav";
import { SiteShell } from "@/components/layout/site-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell variant="admin">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[180px_1fr]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </SiteShell>
  );
}
