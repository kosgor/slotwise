"use server";

// Provider Server Actions. Each one: validate with Zod → write as the signed-in user (RLS and
// column GRANTs decide what is allowed) → expire the public catalog cache so changes show up.

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { BOOKING_ERROR_MESSAGES, bookingErrorMessage } from "@/lib/booking/errors";
import { scheduleTag } from "@/lib/booking/repository";
import { createClient } from "@/lib/supabase/server";
import {
  applyAsProviderSchema,
  exceptionSchema,
  providerProfileSchema,
  scheduleSchema,
  serviceSchema,
  type ScheduleInput,
} from "@/lib/validation/provider";

import { getOwnProvider } from "./queries";

export type ProviderFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const fields = (formData: FormData) => Object.fromEntries(formData) as Record<string, string>;
const invalid = (error: z.ZodError): ProviderFormState => ({
  status: "error",
  message: "Please fix the highlighted fields.",
  fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
});

async function requireOwnProvider() {
  const user = await getCurrentUser();
  if (!user) return null;
  const provider = await getOwnProvider(user.id);
  return provider ? { user, provider } : null;
}

/** Public pages read the catalog from cache; expire it so the change is visible immediately. */
function expireCatalog(slug: string, providerId: string) {
  updateTag("catalog");
  updateTag(`provider:${slug}`);
  updateTag(scheduleTag(providerId));
}

export async function applyAsProvider(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const parsed = applyAsProviderSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_as_provider", {
    p_display_name: v.displayName,
    p_headline: v.headline,
    p_bio: v.bio,
    p_category: v.category,
    p_city: v.city,
    p_timezone: v.timezone,
    p_offers_online: v.offersOnline,
    p_offers_in_person: v.offersInPerson,
  });
  if (error) return { status: "error", message: bookingErrorMessage(error) };
  redirect("/dashboard?applied=1");
}

export async function updateProviderProfile(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const own = await requireOwnProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  const parsed = providerProfileSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("providers")
    .update({
      display_name: v.displayName,
      headline: v.headline,
      bio: v.bio,
      category: v.category,
      city: v.city,
      years_experience: v.yearsExperience,
      languages: v.languages,
      offers_online: v.offersOnline,
      offers_in_person: v.offersInPerson,
    })
    .eq("id", own.provider.id);
  if (error)
    return { status: "error", message: "We could not save your profile. Please try again." };
  expireCatalog(own.provider.slug, own.provider.id);
  return { status: "success", message: "Profile saved." };
}

export async function saveService(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const own = await requireOwnProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  const parsed = serviceSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const values = {
    title: v.title,
    description: v.description,
    duration_min: v.durationMin,
    price_cents: Math.round(v.price * 100),
  };
  const supabase = await createClient();
  const { error } = v.id
    ? await supabase
        .from("services")
        .update(values)
        .eq("id", v.id)
        .eq("provider_id", own.provider.id)
    : await supabase.from("services").insert({ ...values, provider_id: own.provider.id });
  if (error)
    return {
      status: "error",
      // The Free plan limit is enforced by a database trigger (services_plan_limit).
      message:
        error.message === "plan_limit"
          ? BOOKING_ERROR_MESSAGES.plan_limit
          : "We could not save the service. Please try again.",
    };
  expireCatalog(own.provider.slug, own.provider.id);
  return { status: "success", message: v.id ? "Service updated." : "Service added." };
}

/** Enable or disable a service, in place: the list updates and the result is a toast. */
export async function setServiceActive(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const own = await requireOwnProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  const parsed = z
    .object({ id: z.uuid(), active: z.enum(["true", "false"]) })
    .safeParse(fields(formData));
  if (!parsed.success) return { status: "error", message: "Unknown service." };
  const active = parsed.data.active === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update({ active })
    .eq("id", parsed.data.id)
    .eq("provider_id", own.provider.id)
    .select("title")
    .maybeSingle();
  // The Free plan limit is enforced by a database trigger (services_plan_limit).
  if (error?.message === "plan_limit")
    return { status: "error", message: BOOKING_ERROR_MESSAGES.plan_limit };
  if (error || !data)
    return { status: "error", message: "We could not change the service. Please try again." };
  expireCatalog(own.provider.slug, own.provider.id);
  return {
    status: "success",
    message: active
      ? `“${data.title}” is bookable again.`
      : `“${data.title}” is hidden from clients. Existing bookings stay.`,
  };
}

export async function saveSchedule(input: ScheduleInput): Promise<ProviderFormState> {
  const own = await requireOwnProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success)
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid schedule." };

  const supabase = await createClient();
  if (parsed.data.timezone !== own.provider.timezone) {
    const { error } = await supabase
      .from("providers")
      .update({ timezone: parsed.data.timezone })
      .eq("id", own.provider.id);
    if (error) return { status: "error", message: "This time zone is not supported." };
  }
  // One database call replaces the whole week atomically (replace_availability_rules).
  const { error } = await supabase.rpc("replace_availability_rules", {
    p_provider_id: own.provider.id,
    p_rules: parsed.data.rules.map((r) => ({
      weekday: r.weekday,
      start_time: r.startTime,
      end_time: r.endTime,
    })),
  });
  if (error) {
    return {
      status: "error",
      message: error.message.includes("no_overlap")
        ? "Hours on the same day overlap."
        : "We could not save the schedule. Please try again.",
    };
  }
  expireCatalog(own.provider.slug, own.provider.id);
  return { status: "success", message: "Schedule saved." };
}

export async function addException(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const own = await requireOwnProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  const parsed = exceptionSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("availability_exceptions").insert({
    provider_id: own.provider.id,
    date: v.date,
    start_time: v.wholeDay ? null : v.startTime!,
    end_time: v.wholeDay ? null : v.endTime!,
    reason: v.reason,
  });
  if (error) return { status: "error", message: "We could not add the day off. Please try again." };
  expireCatalog(own.provider.slug, own.provider.id);
  return { status: "success", message: "Saved. Clients cannot book this time." };
}

export async function removeException(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const own = await requireOwnProvider();
  if (!own) return { status: "error", message: "You need a provider profile first." };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Unknown day off." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("availability_exceptions")
    .delete()
    .eq("id", id.data)
    .eq("provider_id", own.provider.id);
  if (error) return { status: "error", message: "We could not remove it. Please try again." };
  expireCatalog(own.provider.slug, own.provider.id);
  return { status: "success", message: "Removed. Clients can book this time again." };
}
