"use client"; // Error boundaries must be Client Components

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function MarketingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 py-24 text-center"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">
        We could not load this page. Please try again — if it keeps happening, come back in a few
        minutes.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}
      <Button className="mt-8" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
