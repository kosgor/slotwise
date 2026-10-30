import { ViewerSync } from "@/components/layout/viewer";
import { displayName, getCurrentUser } from "@/lib/auth/session";

/**
 * Server Component: reads the session from cookies (so it renders inside <Suspense> in the header)
 * and hands the viewer to the header's client parts. Renders nothing itself.
 */
export async function SessionViewer() {
  const user = await getCurrentUser();
  return (
    <ViewerSync
      viewer={user ? { name: displayName(user), email: user.email, role: user.role } : null}
    />
  );
}
