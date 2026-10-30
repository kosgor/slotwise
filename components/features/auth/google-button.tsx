import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/auth/actions";

/**
 * Shown only when NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true: Google sign-in needs a Google Cloud OAuth
 * client configured in Supabase (docs/setup-google-auth.md). A visible but broken button is worse
 * than no button.
 */
export function GoogleButton({ next }: { next: string }) {
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") return null;
  return (
    <>
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="outline" className="h-10 w-full">
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.98h5.35c-.23 1.48-1.7 4.34-5.35 4.34-3.22 0-5.85-2.66-5.85-5.95S8.78 6.52 12 6.52c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.98 14.55 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.2 0 8.65-3.65 8.65-8.8 0-.59-.06-1.04-.3-1.1Z"
            />
          </svg>
          Continue with Google
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
