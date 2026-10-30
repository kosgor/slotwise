import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Submit button with a pending state: disabled against double submits, aria-busy for screen readers.
 * Same sizes as Button, so it lines up with the buttons next to it; only the variant differs.
 */
export function SubmitButton({
  pending,
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean; pendingLabel?: string }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending || undefined} {...props}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}
