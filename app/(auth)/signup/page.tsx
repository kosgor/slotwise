import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignUpForm } from "@/components/features/auth/auth-forms";
import { GoogleButton } from "@/components/features/auth/google-button";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNext } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Book sessions and keep track of them in one place.
      </p>
      <div className="mt-6 space-y-5">
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <SignUpContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function SignUpContent({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const next = safeNext((await searchParams).next);
  return (
    <>
      <GoogleButton next={next} />
      <SignUpForm next={next} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
