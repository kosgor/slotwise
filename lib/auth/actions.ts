"use server";

// Auth Server Actions. Each one validates input with Zod on the server (the browser's validation is
// only a convenience) and returns a small state object for useActionState, or redirects on success.

import { headers } from "next/headers";
import { z } from "zod";
import { redirect } from "next/navigation";

import { site } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

import { homeFor } from "./home";
import { safeNext } from "./redirect";

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const fields = (formData: FormData) => Object.fromEntries(formData) as Record<string, string>;

/** Origin of the current request, so email links point back to the same host (3000 dev, 3100 e2e). */
async function requestOrigin() {
  const h = await headers();
  return h.get("origin") ?? site.url;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(fields(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // One generic message for wrong email and wrong password: do not reveal which accounts exist.
    const message =
      error.code === "email_not_confirmed"
        ? "Please confirm your email first — check your inbox for the link."
        : "Email or password is incorrect.";
    return { status: "error", message };
  }
  const next = safeNext(formData.get("next"));
  // "/account" is the default destination: each role starts on its own home page instead.
  if (next === "/account") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    redirect(homeFor(profile?.role));
  }
  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(fields(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the on_auth_user_created trigger to fill profiles.full_name.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (error.code === "weak_password")
      return { status: "error", fieldErrors: { password: [error.message] } };
    if (error.code === "over_email_send_rate_limit") {
      return {
        status: "error",
        message: "Too many emails were sent. Please try again in a few minutes.",
      };
    }
    return { status: "error", message: "We could not create your account. Please try again." };
  }
  // Same answer whether or not the email is already registered (Supabase does the same): no account
  // enumeration through the sign-up form.
  return {
    status: "success",
    message: `We sent a confirmation link to ${parsed.data.email}. Open it to activate your account.`,
  };
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse(fields(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await requestOrigin()}/auth/callback?next=/reset-password`,
  });
  // Always the same message, even if the address is unknown or the request failed.
  return {
    status: "success",
    message: "If an account exists for that email, we sent a link to reset the password.",
  };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse(fields(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "same_password"
          ? "Choose a password different from the old one."
          : "The reset link has expired. Request a new one.",
    };
  }
  redirect("/account?passwordUpdated=1");
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
