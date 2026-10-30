"use client";

import { useId, useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useToastAction } from "@/components/forms/toasts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  moderateReview,
  removeProvider,
  reviewProvider,
  type AdminActionState,
} from "@/lib/admin/actions";

// Admin actions stay on the page (no redirect, no jump to the top): toast on success, errors inline.
const useAdminAction = (
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>,
  onSuccess?: () => void,
) => useToastAction(action, { onSuccess });

const errorOnly = (state: AdminActionState) => (state.status === "error" ? "error" : "idle");

/** One-click approve (or reinstate). The provider's name is in the accessible label of the button. */
export function ApproveForm({
  providerId,
  name,
  label = "Approve",
}: {
  providerId: string;
  name: string;
  label?: string;
}) {
  const [state, action, pending] = useAdminAction(reviewProvider);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="decision" value="approve" />
      <SubmitButton pending={pending} pendingLabel="Saving…" size="sm">
        {label}
        <span className="sr-only"> {name}</span>
      </SubmitButton>
      <FormMessage status={errorOnly(state)} message={state.message} />
    </form>
  );
}

const REASON_COPY = {
  reject: {
    trigger: "Reject",
    title: "Reject this application?",
    description:
      "The provider sees the reason in their dashboard and by email, so they know what to fix.",
    submit: "Reject application",
  },
  suspend: {
    trigger: "Suspend",
    title: "Suspend this profile?",
    description:
      "The profile disappears from the catalog right away. Existing bookings stay; you can reinstate it later.",
    submit: "Suspend profile",
  },
} as const;

/** Reject or suspend. A reason is required to reject (the database checks it too), optional to suspend. */
export function ReasonDialog({
  providerId,
  name,
  decision,
}: {
  providerId: string;
  name: string;
  decision: keyof typeof REASON_COPY;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useAdminAction(reviewProvider, () => setOpen(false));
  const copy = REASON_COPY[decision];
  const required = decision === "reject";
  const noteId = useId();
  const noteError = state.fieldErrors?.note?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {copy.trigger}
          <span className="sr-only"> {name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {name}. {copy.description}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="providerId" value={providerId} />
          <input type="hidden" name="decision" value={decision} />
          <div className="space-y-2">
            <Label htmlFor={noteId}>{required ? "Reason" : "Reason (optional)"}</Label>
            <Textarea
              id={noteId}
              name="note"
              required={required}
              maxLength={500}
              rows={4}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError ? `${noteId}-error` : undefined}
            />
            {noteError && (
              <p id={`${noteId}-error`} className="text-sm text-destructive">
                {noteError}
              </p>
            )}
          </div>
          <FormMessage status={errorOnly(state)} message={noteError ? undefined : state.message} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton pending={pending} pendingLabel="Saving…" variant="destructive">
              {copy.submit}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Remove a provider for good. Final, so the dialog says what happens; the reason is optional. */
export function RemoveProviderDialog({ providerId, name }: { providerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useAdminAction(removeProvider, () => setOpen(false));
  const reasonId = useId();
  const reasonError = state.fieldErrors?.reason?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Remove
          <span className="sr-only"> {name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name} from Slotwise?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>The profile leaves the catalog for good; name, bio and photo are erased.</li>
          <li>Upcoming bookings are cancelled; clients get a full refund and an email.</li>
          <li>The Pro subscription is cancelled; documents for the AI assistant are deleted.</li>
          <li>Past bookings, payments and the audit log stay. The account becomes a client.</li>
        </ul>
        <form action={action} className="space-y-4">
          <input type="hidden" name="providerId" value={providerId} />
          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason (optional)</Label>
            <Textarea
              id={reasonId}
              name="reason"
              maxLength={500}
              rows={3}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${reasonId}-error` : undefined}
            />
            {reasonError && (
              <p id={`${reasonId}-error`} className="text-sm text-destructive">
                {reasonError}
              </p>
            )}
          </div>
          <FormMessage
            status={errorOnly(state)}
            message={reasonError ? undefined : state.message}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton pending={pending} pendingLabel="Removing…" variant="destructive">
              Remove provider
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Hide a review. The reason is optional; when given, the audit log and the reviews table keep it. */
export function HideReviewDialog({ reviewId, author }: { reviewId: string; author: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useAdminAction(moderateReview, () => setOpen(false));
  const reasonId = useId();
  const reasonError = state.fieldErrors?.reason?.[0];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Hide
          <span className="sr-only"> review by {author}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hide this review?</DialogTitle>
          <DialogDescription>
            Review by {author}. It disappears from the public profile and the rating right away; you
            can restore it later.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="hidden" value="true" />
          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason (optional)</Label>
            <Textarea
              id={reasonId}
              name="reason"
              maxLength={300}
              rows={3}
              placeholder="Personal data, insults, not about a session…"
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${reasonId}-error` : undefined}
            />
            {reasonError && (
              <p id={`${reasonId}-error`} className="text-sm text-destructive">
                {reasonError}
              </p>
            )}
          </div>
          <FormMessage
            status={errorOnly(state)}
            message={reasonError ? undefined : state.message}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton pending={pending} pendingLabel="Saving…" variant="destructive">
              Hide review
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RestoreReviewForm({ reviewId, author }: { reviewId: string; author: string }) {
  const [state, action, pending] = useAdminAction(moderateReview);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="hidden" value="false" />
      <SubmitButton pending={pending} pendingLabel="Saving…" size="sm" variant="outline">
        Restore
        <span className="sr-only"> review by {author}</span>
      </SubmitButton>
      <FormMessage status={errorOnly(state)} message={state.message} />
    </form>
  );
}
