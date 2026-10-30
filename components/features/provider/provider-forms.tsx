"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { CheckboxField, SelectField, TextareaField } from "@/components/forms/fields";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { useResultToast } from "@/components/forms/toasts";
import { SubmitButton } from "@/components/forms/submit-button";
import { useValidatedAction } from "@/components/forms/use-validated-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/catalog/types";
import {
  addException,
  applyAsProvider,
  saveService,
  updateProviderProfile,
} from "@/lib/provider/actions";
import {
  applyAsProviderSchema,
  exceptionSchema,
  providerProfileSchema,
  serviceSchema,
} from "@/lib/validation/provider";

import { ProfileDraftAssistant } from "./ai-assist";

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));

export function BecomeProviderForm({ timeZones }: { timeZones: string[] }) {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    applyAsProviderSchema,
    applyAsProvider,
  );
  // Pre-select the browser's time zone after hydration (the server cannot know it).
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZones.includes(tz)) form.setValue("timezone", tz);
  }, [form, timeZones]);

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="Name shown to clients"
        autoComplete="name"
        error={errorFor("displayName")}
        {...form.register("displayName")}
      />
      <FormField
        label="Headline"
        hint="One line about what you offer, e.g. “Piano lessons for adult beginners”."
        error={errorFor("headline")}
        {...form.register("headline")}
      />
      <TextareaField label="About you" rows={5} error={errorFor("bio")} {...form.register("bio")} />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Category"
          options={CATEGORY_OPTIONS}
          error={errorFor("category")}
          {...form.register("category")}
        />
        <FormField
          label="City"
          autoComplete="address-level2"
          error={errorFor("city")}
          {...form.register("city")}
        />
      </div>
      <SelectField
        label="Time zone"
        hint="Your working hours are set in this time zone."
        options={timeZones.map((tz) => ({ value: tz, label: tz }))}
        defaultValue="UTC"
        error={errorFor("timezone")}
        {...form.register("timezone")}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Sessions</legend>
        <CheckboxField
          label="Online"
          error={errorFor("offersOnline")}
          {...form.register("offersOnline")}
        />
        <CheckboxField label="In person" {...form.register("offersInPerson")} />
      </fieldset>
      <SubmitButton pending={pending} pendingLabel="Sending application…">
        Send application
      </SubmitButton>
    </form>
  );
}

export type ProfileDefaults = {
  displayName: string;
  headline: string;
  bio: string;
  category: string;
  city: string;
  yearsExperience: number;
  languages: string;
  offersOnline: boolean;
  offersInPerson: boolean;
};

export function ProviderProfileForm({
  defaults,
  aiDraft = false,
}: {
  defaults: ProfileDefaults;
  /** Show "Draft with AI" (only when the AI provider is configured). */
  aiDraft?: boolean;
}) {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    providerProfileSchema,
    updateProviderProfile,
  );
  useResultToast(state);
  return (
    <>
      {aiDraft && (
        <ProfileDraftAssistant
          onApply={(draft) => {
            form.setValue("headline", draft.headline, { shouldDirty: true, shouldValidate: true });
            form.setValue("bio", draft.bio, { shouldDirty: true, shouldValidate: true });
            form.setFocus("headline");
          }}
        />
      )}
      <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
        <FormMessage status={state.status === "error" ? "error" : "idle"} message={state.message} />
        <FormField
          label="Name shown to clients"
          defaultValue={defaults.displayName}
          error={errorFor("displayName")}
          {...form.register("displayName")}
        />
        <FormField
          label="Headline"
          defaultValue={defaults.headline}
          error={errorFor("headline")}
          {...form.register("headline")}
        />
        <TextareaField
          label="About you"
          rows={6}
          defaultValue={defaults.bio}
          error={errorFor("bio")}
          {...form.register("bio")}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Category"
            options={CATEGORY_OPTIONS}
            defaultValue={defaults.category}
            error={errorFor("category")}
            {...form.register("category")}
          />
          <FormField
            label="City"
            defaultValue={defaults.city}
            error={errorFor("city")}
            {...form.register("city")}
          />
          <FormField
            label="Years of experience"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={defaults.yearsExperience}
            error={errorFor("yearsExperience")}
            {...form.register("yearsExperience")}
          />
          <FormField
            label="Languages"
            hint="Separate with commas."
            defaultValue={defaults.languages}
            error={errorFor("languages")}
            {...form.register("languages")}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Sessions</legend>
          <CheckboxField
            label="Online"
            defaultChecked={defaults.offersOnline}
            error={errorFor("offersOnline")}
            {...form.register("offersOnline")}
          />
          <CheckboxField
            label="In person"
            defaultChecked={defaults.offersInPerson}
            {...form.register("offersInPerson")}
          />
        </fieldset>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save profile
        </SubmitButton>
      </form>
    </>
  );
}

export type ServiceDefaults = {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  price: number;
};

/** Add or edit a service in a dialog. One form for both: an empty id means "create". */
export function ServiceDialog({ service }: { service?: ServiceDefaults }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="outline" size="sm">
            Edit<span className="sr-only"> {service.title}</span>
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden="true" />
            Add service
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add a service"}</DialogTitle>
          <DialogDescription>
            Clients see the title, duration and price when booking.
          </DialogDescription>
        </DialogHeader>
        {/* Remount the form for every opening so it starts clean. */}
        {open && <ServiceForm service={service} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({ service, onSaved }: { service?: ServiceDefaults; onSaved: () => void }) {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    serviceSchema,
    saveService,
  );
  useResultToast(state);
  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [state.status, onSaved]);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" value={service?.id ?? ""} {...form.register("id")} />
      <FormMessage status={state.status === "error" ? "error" : "idle"} message={state.message} />
      <FormField
        label="Title"
        defaultValue={service?.title}
        error={errorFor("title")}
        {...form.register("title")}
      />
      <TextareaField
        label="Description"
        rows={3}
        defaultValue={service?.description}
        error={errorFor("description")}
        {...form.register("description")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Duration, minutes"
          type="number"
          inputMode="numeric"
          min={15}
          step={5}
          defaultValue={service?.durationMin ?? 60}
          error={errorFor("durationMin")}
          {...form.register("durationMin")}
        />
        <FormField
          label="Price, £"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          hint="0 makes it free."
          defaultValue={service?.price ?? 50}
          error={errorFor("price")}
          {...form.register("price")}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {service ? "Save changes" : "Add service"}
      </SubmitButton>
    </form>
  );
}

export function ExceptionForm() {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    exceptionSchema,
    addException,
  );
  const wholeDay = form.watch("wholeDay") ?? true;
  useResultToast(state);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state, formRef]);
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <FormMessage status={state.status === "error" ? "error" : "idle"} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Date" type="date" error={errorFor("date")} {...form.register("date")} />
        <FormField
          label="Reason (optional)"
          hint="Only you see this."
          {...form.register("reason")}
        />
      </div>
      <CheckboxField label="Whole day off" defaultChecked {...form.register("wholeDay")} />
      {!wholeDay && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="From"
            type="time"
            error={errorFor("startTime")}
            {...form.register("startTime")}
          />
          <FormField
            label="To"
            type="time"
            error={errorFor("endTime")}
            {...form.register("endTime")}
          />
        </div>
      )}
      <SubmitButton pending={pending} pendingLabel="Saving…" variant="outline">
        Add time off
      </SubmitButton>
    </form>
  );
}
