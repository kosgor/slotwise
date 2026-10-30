"use client"; // Error boundaries must be Client Components

// Last resort: an error in the root layout itself. It replaces the whole document, so it brings its
// own <html> and <body> and cannot rely on the app's styles or fonts.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}
      >
        <main role="alert">
          <h1>Something went wrong</h1>
          <p>Slotwise could not load. Please try again in a moment.</p>
          {error.digest && <p style={{ fontFamily: "monospace" }}>Error ID: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
