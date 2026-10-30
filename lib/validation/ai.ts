import { z } from "zod";

/** Structured output of "Draft with AI" on the profile page. Fits providers.headline / bio. */
export const profileDraftSchema = z.object({
  headline: z
    .string()
    .min(10)
    .max(120)
    .describe("One line under 120 characters: who you help and how"),
  bio: z.string().min(100).max(1200).describe("Two or three short paragraphs, first person"),
});
export type ProfileDraft = z.infer<typeof profileDraftSchema>;

/** Structured output of the provider's weekly summary. */
export const weeklySummarySchema = z.object({
  title: z.string().max(80).describe("A short, specific title for the week"),
  highlights: z.array(z.string().max(160)).min(1).max(4),
  suggestion: z.string().max(240).describe("One practical idea for next week"),
});
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
