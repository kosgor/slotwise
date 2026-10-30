"use client";

import { useState } from "react";

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

type State = { status: "idle" | "error" | "success"; message?: string };

type Props = {
  action: (state: State, formData: FormData) => Promise<State>;
  /** Hidden form fields (the id of the row, the new value). */
  fields: Record<string, string>;
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  /** Ask first (for deleting): the button opens a dialog, its confirm button runs the action. */
  confirm?: { title: string; description: string; label: string };
};

/**
 * One button that runs a Server Action in place: the page stays where it is, the list updates
 * with the response, the result is a toast (success and error alike: a lone button has no room
 * for an inline message). Destructive ones ask first in a dialog.
 */
export function ActionButton({
  action,
  fields,
  children,
  pendingLabel = "Saving…",
  variant = "ghost",
  size = "sm",
  confirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [, formAction, pending] = useToastAction(action, {
    toastErrors: true,
    onSuccess: () => setOpen(false),
  });

  const form = (submit: React.ReactNode) => (
    <form action={formAction}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {submit}
    </form>
  );

  if (!confirm) {
    return form(
      <SubmitButton pending={pending} pendingLabel={pendingLabel} variant={variant} size={size}>
        {children}
      </SubmitButton>,
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirm.title}</DialogTitle>
          <DialogDescription>{confirm.description}</DialogDescription>
        </DialogHeader>
        {form(
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton pending={pending} pendingLabel={pendingLabel} variant="destructive">
              {confirm.label}
            </SubmitButton>
          </DialogFooter>,
        )}
      </DialogContent>
    </Dialog>
  );
}
