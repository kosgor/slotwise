"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { useResultToast } from "@/components/forms/toasts";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadDocument, type DocumentFormState } from "@/lib/ai/document-actions";

const IDLE: DocumentFormState = { status: "idle" };

export function UploadDocumentForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(uploadDocument, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const fileId = useId();
  const titleError = state.fieldErrors?.title?.[0];
  const fileError = state.fieldErrors?.file?.[0];

  useResultToast(state);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4 rounded-xl border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={titleId}>Title</Label>
          <Input
            id={titleId}
            name="title"
            required
            maxLength={120}
            placeholder="Cancellation policy"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? `${titleId}-error` : undefined}
          />
          {titleError && (
            <p id={`${titleId}-error`} className="text-sm text-destructive">
              {titleError}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={fileId}>File (.txt or .md, up to 200 KB)</Label>
          <Input
            id={fileId}
            name="file"
            type="file"
            required
            accept=".txt,.md,text/plain,text/markdown"
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? `${fileId}-error` : undefined}
          />
          {fileError && (
            <p id={`${fileId}-error`} className="text-sm text-destructive">
              {fileError}
            </p>
          )}
        </div>
      </div>
      <FormMessage status={state.status === "error" ? "error" : "idle"} message={state.message} />
      <SubmitButton pending={pending} pendingLabel="Uploading…" disabled={disabled || pending}>
        Upload document
      </SubmitButton>
    </form>
  );
}
