// Shared by the browser (instant feedback via React Hook Form) and the server (the real check).
// Password rules match supabase/config.toml: at least 8 characters, letters and digits.
import { z } from "zod";

const email = z
  .email("Enter a valid email address, for example anna@example.com.")
  .trim()
  .toLowerCase();

const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[a-zA-Z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one digit.");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(80, "Use at most 80 characters."),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
