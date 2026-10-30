"use server";

// Structured output: the model fills a Zod schema instead of writing free text, so the result can
// go straight into form fields and cards. Both actions count against the user's AI allowance.

import { generateText, Output } from "ai";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { BOOKING_ERROR_MESSAGES } from "@/lib/booking/errors";
import { listProviderBookings } from "@/lib/booking/queries";
import { log } from "@/lib/log";
import { getOwnProvider } from "@/lib/provider/queries";
import { createClient } from "@/lib/supabase/server";
import {
  profileDraftSchema,
  weeklySummarySchema,
  type ProfileDraft,
  type WeeklySummary,
} from "@/lib/validation/ai";

import { chatModel, chatModelId, isAiConfigured, tokenCounts } from "./models";
import { PROFILE_DRAFT_INSTRUCTIONS, WEEKLY_SUMMARY_INSTRUCTIONS } from "./prompts";
import { claimAiRequest, finishAiRequest, type AiFeature } from "./usage";
import { weeklyStats } from "./weekly-stats";

export type GenerateState<T> = {
  status: "idle" | "error" | "success";
  message?: string;
  result?: T;
};

type OwnProvider = NonNullable<Awaited<ReturnType<typeof getOwnProvider>>>;
type Ready = { ok: true; usageId: string; provider: OwnProvider } | { ok: false; message: string };

async function prepare(feature: AiFeature): Promise<Ready> {
  if (!isAiConfigured()) return { ok: false, message: BOOKING_ERROR_MESSAGES.ai_unavailable };
  const user = await getCurrentUser();
  const provider = user ? await getOwnProvider(user.id) : null;
  if (!provider) return { ok: false, message: "Only providers can use this." };
  const claim = await claimAiRequest(await createClient(), feature, provider.id);
  if (!claim.ok)
    return {
      ok: false,
      message:
        claim.code === "ai_rate_limited" || claim.code === "ai_daily_limit"
          ? BOOKING_ERROR_MESSAGES[claim.code]
          : BOOKING_ERROR_MESSAGES.ai_unavailable,
    };
  return { ok: true, usageId: claim.usageId, provider };
}

export async function draftProfile(
  _prev: GenerateState<ProfileDraft>,
  formData: FormData,
): Promise<GenerateState<ProfileDraft>> {
  const notes = z.string().trim().min(10).max(1000).safeParse(formData.get("notes"));
  if (!notes.success)
    return { status: "error", message: "Write a few words about your work (10–1000 characters)." };
  const ready = await prepare("profile_draft");
  if (!ready.ok) return { status: "error", message: ready.message };
  const p = ready.provider;

  try {
    const { output, usage } = await generateText({
      model: chatModel(),
      instructions: PROFILE_DRAFT_INSTRUCTIONS,
      prompt: JSON.stringify({
        profile: {
          name: p.display_name,
          category: p.category,
          city: p.city,
          yearsExperience: p.years_experience,
          languages: p.languages,
          online: p.offers_online,
          inPerson: p.offers_in_person,
        },
        notes: notes.data,
      }),
      output: Output.object({ schema: profileDraftSchema }),
      maxOutputTokens: 700,
    });
    await finishAiRequest(ready.usageId, { model: chatModelId(), ...tokenCounts(usage) });
    return { status: "success", result: output };
  } catch (error) {
    log.error("ai.profile_draft_failed", error, { providerId: p.id });
    await finishAiRequest(ready.usageId, {
      model: chatModelId(),
      tokensIn: 0,
      tokensOut: 0,
      failed: true,
    });
    return { status: "error", message: "The draft could not be written. Please try again." };
  }
}

export async function writeWeeklySummary(): Promise<GenerateState<WeeklySummary>> {
  const ready = await prepare("weekly_summary");
  if (!ready.ok) return { status: "error", message: ready.message };
  const p = ready.provider;
  const now = new Date();
  const bookings = await listProviderBookings(p.id, {
    from: new Date(now.getTime() - 8 * 86_400_000),
    to: new Date(now.getTime() + 8 * 86_400_000),
  });
  const stats = weeklyStats(bookings, now, p.timezone);

  try {
    const { output, usage } = await generateText({
      model: chatModel(),
      instructions: WEEKLY_SUMMARY_INSTRUCTIONS,
      prompt: JSON.stringify({ provider: p.display_name, ...stats }),
      output: Output.object({ schema: weeklySummarySchema }),
      maxOutputTokens: 500,
    });
    await finishAiRequest(ready.usageId, { model: chatModelId(), ...tokenCounts(usage) });
    return { status: "success", result: output };
  } catch (error) {
    log.error("ai.weekly_summary_failed", error, { providerId: p.id });
    await finishAiRequest(ready.usageId, {
      model: chatModelId(),
      tokensIn: 0,
      tokensOut: 0,
      failed: true,
    });
    return { status: "error", message: "The summary could not be written. Please try again." };
  }
}
