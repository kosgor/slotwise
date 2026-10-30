import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignInForm } from "@/components/features/auth/auth-forms";
import { GoogleButton } from "@/components/features/auth/google-button";
import { FlashToast } from "@/components/forms/toasts";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNext } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const LINK_ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or request a new link.",
  oauth: "Google sign-in is not available right now. Use your email and password.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Manage your bookings and your schedule.</p>
      <div className="mt-6 space-y-5">
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const error = typeof params.error === "string" ? LINK_ERRORS[params.error] : undefined;
  return (
    <>
      {error && <FlashToast status="error" message={error} params={["error"]} />}
      <GoogleButton next={next} />
      <SignInForm next={next} />
      <p className="text-center text-sm text-muted-foreground">
        New to Slotwise?{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
