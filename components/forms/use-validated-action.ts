"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useRef } from "react";
import { useForm, type FieldValues, type Resolver } from "react-hook-form";
import type { z } from "zod";

type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

/**
 * React Hook Form (instant client-side validation) + a Server Action (the real, server-side check).
 *
 * - With JavaScript: fields are validated on blur/submit; only a valid form calls the action.
 * - Without JavaScript: the <form action={…}> posts straight to the Server Action, which validates
 *   again — the form still works.
 * - errorFor(name) merges client and server errors for one field.
 */
export function useValidatedAction<T extends FieldValues>(
  schema: z.ZodType<T>,
  action: (state: ActionState, formData: FormData) => Promise<ActionState>,
) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<T>({
    // The resolver typing does not follow a generic schema; the schema itself is fully typed.
    resolver: zodResolver(schema as never) as unknown as Resolver<T>,
    mode: "onTouched",
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void form.handleSubmit(() => {
      startTransition(() => formAction(new FormData(formRef.current!)));
    })(event);
  };

  const errorFor = (name: string): string | undefined =>
    (form.formState.errors as Record<string, { message?: string } | undefined>)[name]?.message ??
    state.fieldErrors?.[name]?.[0];

  return { form, state, pending, formRef, formAction, onSubmit, errorFor };
}
