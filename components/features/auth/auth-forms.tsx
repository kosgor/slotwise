"use client";

import Link from "next/link";

import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useValidatedAction } from "@/components/forms/use-validated-action";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/lib/auth/actions";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

// autoComplete values let password managers fill the right fields and suggest strong passwords
// ("current-password" on sign-in, "new-password" on sign-up and reset).

export function SignInForm({ next }: { next: string }) {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    signInSchema,
    signIn,
  );
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errorFor("email")}
        {...form.register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errorFor("password")}
        {...form.register("password")}
      />
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <SubmitButton pending={pending} pendingLabel="Signing in…" className="h-10 w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    signUpSchema,
    signUp,
  );
  if (state.status === "success") {
    return <FormMessage status="success" message={state.message} />;
  }
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="Full name"
        autoComplete="name"
        error={errorFor("fullName")}
        {...form.register("fullName")}
      />
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errorFor("email")}
        {...form.register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with letters and digits."
        error={errorFor("password")}
        {...form.register("password")}
      />
      <SubmitButton pending={pending} pendingLabel="Creating account…" className="h-10 w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    forgotPasswordSchema,
    requestPasswordReset,
  );
  if (state.status === "success") {
    return <FormMessage status="success" message={state.message} />;
  }
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errorFor("email")}
        {...form.register("email")}
      />
      <SubmitButton pending={pending} pendingLabel="Sending…" className="h-10 w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const { form, state, pending, formRef, formAction, onSubmit, errorFor } = useValidatedAction(
    resetPasswordSchema,
    updatePassword,
  );
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with letters and digits."
        error={errorFor("password")}
        {...form.register("password")}
      />
      <FormField
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        error={errorFor("confirmPassword")}
        {...form.register("confirmPassword")}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…" className="h-10 w-full">
        Save new password
      </SubmitButton>
    </form>
  );
}
