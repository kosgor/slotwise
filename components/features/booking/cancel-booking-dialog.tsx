"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
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
import { cancelBooking, type BookingActionState } from "@/lib/booking/actions";

/**
 * Confirmation before an irreversible action. Radix Dialog moves focus inside, traps Tab,
 * closes on Esc and returns focus to the trigger. The result is announced via FormMessage.
 */
export function CancelBookingDialog({
  bookingId,
  summary,
  policy,
  returnTo,
  triggerLabel = "Cancel booking",
}: {
  bookingId: string;
  /** "Private class, Tue 3 Nov, 10:00" — repeated in the dialog so the user knows what they cancel. */
  summary: string;
  policy: string;
  /** Page to come back to after cancelling (it shows a confirmation banner). */
  returnTo: string;
  triggerLabel?: string;
}) {
  const [state, action, pending] = useActionState<BookingActionState, FormData>(cancelBooking, {
    status: "idle",
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
          <span className="sr-only">: {summary}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            {summary}. {policy}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <FormMessage status={state.status} message={state.message} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep booking
              </Button>
            </DialogClose>
            <SubmitButton pending={pending} pendingLabel="Cancelling…" variant="destructive">
              Cancel booking
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
