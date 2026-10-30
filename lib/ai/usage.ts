// Counting AI requests. claim → model call → finish.
//
// claimAiRequest runs as the user: claim_ai_request() checks the rate limit and the daily
// allowance and records the request in one transaction. finishAiRequest writes tokens and cost
// with the server key, because users can read their usage but never write it (otherwise anyone
// could zero their own numbers through the Data API).

import "server-only";

import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

import { costMicros } from "./models";

type UserClient = Awaited<ReturnType<typeof createClient>>;

export type AiFeature = "chat" | "profile_draft" | "weekly_summary";

export type ClaimResult =
  | { ok: true; usageId: string }
  | { ok: false; code: "not_authenticated" | "ai_rate_limited" | "ai_daily_limit" | "unknown" };

export async function claimAiRequest(
  supabase: UserClient,
  feature: AiFeature,
  providerId: string | null = null,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_ai_request", {
    p_feature: feature,
    p_provider_id: providerId ?? undefined,
  });
  if (error || !data) {
    const code = error?.message;
    if (code === "not_authenticated" || code === "ai_rate_limited" || code === "ai_daily_limit")
      return { ok: false, code };
    log.error("ai.claim_failed", error, { feature });
    return { ok: false, code: "unknown" };
  }
  return { ok: true, usageId: data };
}

/** Never throws: an answer the user already got must not fail because bookkeeping did. */
export async function finishAiRequest(
  usageId: string,
  result: { model: string; tokensIn: number; tokensOut: number; failed?: boolean },
): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("ai_usage")
      .update({
        model: result.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_micros: costMicros(result.model, result.tokensIn, result.tokensOut),
        status: result.failed ? "failed" : "finished",
      })
      .eq("id", usageId);
    if (error) throw error;
  } catch (error) {
    log.error("ai.usage_not_recorded", error, { usageId });
  }
}

/** Embeddings made by the document job: no user request to claim, the provider pays. */
export async function recordEmbeddingUsage(input: {
  providerId: string;
  userId: string | null;
  model: string;
  tokens: number;
}): Promise<void> {
  const { error } = await createAdminClient()
    .from("ai_usage")
    .insert({
      user_id: input.userId,
      provider_id: input.providerId,
      feature: "document_embedding",
      model: input.model,
      status: "finished",
      tokens_in: input.tokens,
      cost_micros: costMicros(input.model, input.tokens, 0),
    });
  if (error) log.error("ai.embedding_usage_not_recorded", error, { providerId: input.providerId });
}

export async function aiRequestsLeft(supabase: UserClient): Promise<number | null> {
  const { data, error } = await supabase.rpc("ai_requests_left");
  return error ? null : data;
}
