// Provider forms: shared by the browser (instant feedback) and Server Actions (the real check).
// Limits mirror the CHECK constraints in supabase/migrations.
import { z } from "zod";

import { CATEGORIES } from "@/lib/catalog/types";

import { dateKey, timeZone } from "./booking";

const text = (max: number, message: string) =>
  z.string().trim().max(max, `Use at most ${max} characters.`).min(1, message);

/** Checkbox values from FormData: "on" when checked, missing when not. */
const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const formats = <T extends { offersOnline: boolean; offersInPerson: boolean }>(v: T) =>
  v.offersOnline || v.offersInPerson;
const formatsError = { message: "Choose online, in person or both.", path: ["offersOnline"] };

export const applyAsProviderSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter the name clients will see.").max(80),
    headline: text(120, "Describe what you offer in one line."),
    bio: z.string().trim().max(2000, "Use at most 2000 characters.").default(""),
    category: z.enum(CATEGORIES, "Choose a category."),
    city: text(80, "Enter your city."),
    timezone: timeZone,
    offersOnline: checkbox,
    offersInPerson: checkbox,
  })
  .refine(formats, formatsError);

export const providerProfileSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter the name clients will see.").max(80),
    headline: text(120, "Describe what you offer in one line."),
    bio: z.string().trim().max(2000, "Use at most 2000 characters."),
    category: z.enum(CATEGORIES, "Choose a category."),
    city: text(80, "Enter your city."),
    yearsExperience: z.coerce.number().int().min(0, "Cannot be negative.").max(80),
    languages: z
      .string()
      .trim()
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().max(30)).max(10, "List at most 10 languages.")),
    offersOnline: checkbox,
    offersInPerson: checkbox,
  })
  .refine(formats, formatsError);

export const serviceSchema = z.object({
  id: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(2, "Enter a title.").max(80),
  description: z.string().trim().max(500, "Use at most 500 characters."),
  durationMin: z.coerce
    .number("Enter the duration in minutes.")
    .int()
    .min(15, "At least 15 minutes.")
    .max(480, "At most 8 hours."),
  // Entered in pounds, stored in integer pence (no floating-point money in the database).
  price: z.coerce.number("Enter a price.").min(0, "Cannot be negative.").max(10_000),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");

export const scheduleSchema = z.object({
  timezone: timeZone,
  rules: z
    .array(
      z
        .object({ weekday: z.number().int().min(1).max(7), startTime: hhmm, endTime: hhmm })
        .refine((r) => r.startTime < r.endTime, {
          message: "End must be after start.",
          path: ["endTime"],
        }),
    )
    .max(50)
    .superRefine((rules, ctx) => {
      // Same rule as the availability_rules_no_overlap constraint, reported per field.
      rules.forEach((a, i) =>
        rules.forEach((b, j) => {
          if (
            i < j &&
            a.weekday === b.weekday &&
            a.startTime < b.endTime &&
            b.startTime < a.endTime
          ) {
            ctx.addIssue({
              code: "custom",
              message: "Hours on the same day overlap.",
              path: [j, "startTime"],
            });
          }
        }),
      );
    }),
});

export const exceptionSchema = z
  .object({
    date: dateKey,
    wholeDay: checkbox,
    startTime: hhmm.optional().or(z.literal("").transform(() => undefined)),
    endTime: hhmm.optional().or(z.literal("").transform(() => undefined)),
    reason: z.string().trim().max(120).default(""),
  })
  .refine((v) => v.wholeDay || (v.startTime && v.endTime && v.startTime < v.endTime), {
    message: "Choose the whole day or a start and end time.",
    path: ["startTime"],
  });

export type ApplyAsProviderInput = z.input<typeof applyAsProviderSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
