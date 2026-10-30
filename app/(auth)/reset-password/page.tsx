import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/features/auth/auth-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

// Reached from the reset email: /auth/callback has already exchanged the link for a session.
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <div className="mt-6 space-y-5">
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <ResetPasswordContent />
        </Suspense>
      </div>
    </>
  );
}

async function ResetPasswordContent() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        This reset link has expired.{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Request a new one
        </Link>
        .
      </p>
    );
  }
  return <ResetPasswordForm />;
}
