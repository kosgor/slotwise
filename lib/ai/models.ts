// Which models the app uses and what they cost. Gemini through the Vercel AI SDK: swapping the
// provider means changing this file only (docs/decisions/0011).

import "server-only";

import { google, type GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import type { LanguageModelUsage } from "ai";

/** Cheap and fast; good enough for tool calling and short answers. AI_CHAT_MODEL overrides it. */
const CHAT_MODEL = process.env.AI_CHAT_MODEL || "gemini-3.5-flash-lite";
const EMBEDDING_MODEL = "gemini-embedding-2";
/** document_chunks.embedding is vector(768): the model's 3072 dimensions, reduced. */
export const EMBEDDING_DIMENSIONS = 768;

/** The key is read by @ai-sdk/google from GOOGLE_GENERATIVE_AI_API_KEY. Server only. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export const chatModel = () => google(CHAT_MODEL);
export const chatModelId = () => CHAT_MODEL;
export const embeddingModel = () => google.embedding(EMBEDDING_MODEL);
export const embeddingModelId = () => EMBEDDING_MODEL;

export function embeddingOptions(task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  return {
    google: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: task,
    } satisfies GoogleEmbeddingModelOptions,
  };
}

/**
 * Paid-tier prices in US dollars per million tokens (ai.google.dev/gemini-api/docs/pricing,
 * October 2026). On the free tier the real bill is $0; ai_usage records what the same traffic
 * would cost on the paid tier, which is the number that matters before launch.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-embedding-2": { input: 0.2, output: 0 },
};

/** Cost in micro-dollars (ai_usage.cost_micros). Unknown models are priced like the default one. */
export function costMicros(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICES[model] ?? PRICES["gemini-3.5-flash-lite"]!;
  // $ per million tokens = micro-dollars per token.
  return Math.round(tokensIn * price.input + tokensOut * price.output);
}

export function tokenCounts(usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens">) {
  return { tokensIn: usage.inputTokens ?? 0, tokensOut: usage.outputTokens ?? 0 };
}
