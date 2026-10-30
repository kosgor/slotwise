import { z } from "zod";

export const REVIEW_DECISIONS = ["approve", "reject", "suspend"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const reviewProviderSchema = z.object({
  providerId: z.uuid(),
  decision: z.enum(REVIEW_DECISIONS),
  note: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
});

/** The reason is optional; when given, the provider sees it and the audit log keeps it. */
export const removeProviderSchema = z.object({
  providerId: z.uuid(),
  reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
});

export const moderateReviewSchema = z.object({
  reviewId: z.uuid(),
  hidden: z.enum(["true", "false"]).transform((v) => v === "true"),
  reason: z.string().trim().max(300, "Keep the reason under 300 characters.").optional(),
});
