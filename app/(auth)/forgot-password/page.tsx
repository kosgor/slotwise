import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/features/auth/auth-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the email you signed up with. We will send you a link to choose a new password.
      </p>
      <div className="mt-6 space-y-5">
        <ForgotPasswordForm />
        <p className="text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </>
  );
}
