"use client";

import { SparklesIcon } from "lucide-react";
import { useActionState, useId, useRef } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { draftProfile, writeWeeklySummary, type GenerateState } from "@/lib/ai/generate-actions";
import type { ProfileDraft, WeeklySummary } from "@/lib/validation/ai";

/**
 * "Draft with AI": notes in, headline and bio out. Nothing is saved — the draft goes into the
 * form fields only when the provider chooses "Use this draft", and they still press Save.
 */
export function ProfileDraftAssistant({ onApply }: { onApply: (draft: ProfileDraft) => void }) {
  const [state, action, pending] = useActionState(draftProfile, {
    status: "idle",
  } as GenerateState<ProfileDraft>);
  const notesId = useId();
  const resultRef = useRef<HTMLDivElement>(null);

  return (
    <details className="rounded-xl border bg-muted/30 p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
        Draft headline and bio with AI
      </summary>
      {/* Its own form, not nested in the profile form: a nested <form> is invalid HTML. */}
      <form action={action} className="mt-3 space-y-3">
        <div className="space-y-2">
          <Label htmlFor={notesId}>A few notes about your work</Label>
          <Textarea
            id={notesId}
            name="notes"
            rows={3}
            maxLength={1000}
            required
            placeholder="Physio-trained yoga teacher, small groups, beginners and back pain, calm style"
          />
        </div>
        <FormMessage status={state.status === "error" ? "error" : "idle"} message={state.message} />
        <SubmitButton pending={pending} pendingLabel="Writing…" variant="outline" size="sm">
          Write a draft
        </SubmitButton>
      </form>
      {state.status === "success" && state.result && (
        <div ref={resultRef} className="mt-4 space-y-2 rounded-lg border bg-background p-3 text-sm">
          <p role="status" className="sr-only">
            Draft ready.
          </p>
          <p className="font-medium">{state.result.headline}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{state.result.bio}</p>
          <Button type="button" size="sm" onClick={() => onApply(state.result!)}>
            Use this draft
          </Button>
          <p className="text-xs text-muted-foreground">
            Fills Headline and About you below. Check it, then press Save.
          </p>
        </div>
      )}
    </details>
  );
}

export function WeeklySummaryCard() {
  const [state, action, pending] = useActionState(writeWeeklySummary, {
    status: "idle",
  } as GenerateState<WeeklySummary>);

  return (
    <section aria-labelledby="week-title" className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="week-title" className="text-xl font-semibold">
          Your week
        </h2>
        <form action={action}>
          <SubmitButton pending={pending} pendingLabel="Writing…" variant="outline" size="sm">
            <SparklesIcon aria-hidden="true" />
            {state.result ? "Write again" : "Write my weekly summary"}
          </SubmitButton>
        </form>
      </div>
      <FormMessage
        className="mt-3"
        status={state.status === "error" ? "error" : "idle"}
        message={state.message}
      />
      {state.result ? (
        <div role="status" className="mt-3 space-y-2 text-sm">
          <p className="font-medium">{state.result.title}</p>
          <ul className="list-disc space-y-1 pl-5">
            {state.result.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">Idea: {state.result.suggestion}</p>
        </div>
      ) : (
        state.status !== "error" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Sessions, earnings and cancellations of the last 7 days and what is coming next, in a
            few sentences. The numbers come from your bookings; AI only writes the words.
          </p>
        )
      )}
    </section>
  );
}
