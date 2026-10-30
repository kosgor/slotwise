"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { FormMessage } from "@/components/forms/form-message";

/**
 * A one-time notice carried in the URL after a redirect (?cancelled=1, ?reviewed=…): shown as a toast
 * once, then its params leave the address bar, so a refresh, Back or a copied link never repeat it.
 * Runs after every render, not once: a second redirect to the same notice (another booking
 * cancelled) brings the params back and shows it again. Without JavaScript it stays inline.
 */
export function FlashToast({
  message,
  params,
  status = "success",
}: {
  message: string;
  /** The URL params that carry this notice; removed once it is shown. */
  params: string[];
  status?: "success" | "error";
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!params.some((p) => url.searchParams.has(p))) return;
    if (status === "error") toast.error(message);
    else toast.success(message);
    for (const p of params) url.searchParams.delete(p);
    // The native history API keeps the Next.js router in sync and does not refetch the page.
    window.history.replaceState(null, "", url);
  });
  return (
    <noscript>
      <FormMessage status={status} message={message} />
    </noscript>
  );
}

/**
 * Toasts a Server Action's success message. Keyed on the state object, which is new for every
 * submission, so saving twice in a row shows the toast twice. Errors stay inline (FormMessage), next
 * to the form that needs fixing.
 */
export function useResultToast(state: { status: string; message?: string }) {
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
  }, [state]);
}

type ActionState = { status: "idle" | "error" | "success"; message?: string };

/**
 * useActionState for an action that stays on the page: a success message becomes a toast and
 * `onSuccess` runs (closing a dialog, say). Called here, not in an effect, so it fires even when
 * the component unmounts with the update (a row that re-renders into another shape). Errors stay
 * in the returned state for an inline message, or become a toast too with `toastErrors` (a lone
 * button has nowhere to show them). Needs JavaScript: the action is wrapped on the client.
 */
export function useToastAction<S extends ActionState>(
  action: (state: S, formData: FormData) => Promise<S>,
  { onSuccess, toastErrors = false }: { onSuccess?: () => void; toastErrors?: boolean } = {},
) {
  return useActionState<S, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.status === "success") {
        if (result.message) toast.success(result.message);
        onSuccess?.();
      } else if (result.status === "error" && toastErrors && result.message) {
        toast.error(result.message);
      }
      return result;
    },
    { status: "idle" } as Awaited<S>,
  );
}
