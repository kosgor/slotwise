// POST /api/chat — the AI concierge, streamed (AI SDK UI message stream).
//
// Order matters: who is asking → which conversation (theirs only) → what is new in the request
// (one user message, or an approval answer) → limits → model. The history the model sees is read
// from the database, never taken from the request. See docs/decisions/0011.

import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mergeIncomingMessage, trimHistory, userText } from "@/lib/ai/chat-messages";
import {
  loadMessages,
  openConversation,
  saveMessages,
  touchConversation,
} from "@/lib/ai/chat-store";
import type { ChatMessage } from "@/lib/ai/chat-types";
import { MAX_OUTPUT_TOKENS, MAX_STEPS } from "@/lib/ai/limits";
import { chatModel, chatModelId, isAiConfigured, tokenCounts } from "@/lib/ai/models";
import { chatInstructions } from "@/lib/ai/prompts";
import { createDocumentSearch } from "@/lib/ai/rag";
import { activeChatTools, chatToolApproval, createChatTools } from "@/lib/ai/tools";
import { claimAiRequest, finishAiRequest } from "@/lib/ai/usage";
import { loadFreeSlots } from "@/lib/booking/availability";
import { cancelAsUser } from "@/lib/booking/cancel";
import { BOOKING_ERROR_MESSAGES } from "@/lib/booking/errors";
import { localToday } from "@/lib/booking/slots";
import { getCurrentUser } from "@/lib/auth/session";
import { listClientBookings } from "@/lib/booking/queries";
import { parseCatalogQuery } from "@/lib/catalog/query";
import { getProviderBySlug, searchProviders } from "@/lib/catalog/repository";
import { dateKeyToDate } from "@/lib/datetime";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { viewerTimeZone } from "@/lib/viewer-timezone";

export const maxDuration = 30;

const MAX_BODY_BYTES = 64_000;

const bodySchema = z.object({
  id: z.uuid(),
  message: z.object({
    id: z.string().min(1).max(64),
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.looseObject({ type: z.string() })).max(50),
  }),
  trigger: z.enum(["submit-message", "regenerate-message"]),
  providerSlug: z.string().max(80).optional(),
});

const fail = (status: number, code: string, message?: string) =>
  NextResponse.json(
    {
      error: code,
      message:
        message ??
        BOOKING_ERROR_MESSAGES[code as keyof typeof BOOKING_ERROR_MESSAGES] ??
        "Something went wrong. Please try again.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );

const nextMessageId = createIdGenerator({ prefix: "msg", size: 16 });

export async function POST(req: Request) {
  if (!isAiConfigured()) return fail(503, "ai_unavailable");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return fail(413, "too_large", "This message is too long.");

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "We could not read this message.");
  const { id, trigger, providerSlug } = parsed.data;
  const incoming = parsed.data.message as unknown as ChatMessage;

  const user = await getCurrentUser();
  if (!user) return fail(401, "not_authenticated", "Please sign in to chat with the assistant.");
  const supabase = await createClient();

  const provider = providerSlug ? await getProviderBySlug(providerSlug) : null;
  if (providerSlug && !provider) return fail(404, "provider_not_found");
  const conversation = await openConversation(supabase, id, provider?.id ?? null);
  if (!conversation) return fail(404, "conversation_not_found", "This conversation was not found.");

  const history = await loadMessages(supabase, conversation.id);
  const merged = mergeIncomingMessage(history, incoming, trigger);
  if (!merged.ok) {
    const text = {
      empty_message: "Write a message first.",
      message_too_long: "Please keep messages under 1,000 characters.",
      unknown_message: "This conversation has changed. Reload the page and try again.",
    }[merged.error];
    return fail(400, merged.error, text);
  }

  // Counted before the model is called: a refused request costs nothing.
  const claim = await claimAiRequest(supabase, "chat", provider?.id ?? null);
  if (!claim.ok) {
    const status = claim.code === "not_authenticated" ? 401 : claim.code === "unknown" ? 503 : 429;
    return fail(status, claim.code === "unknown" ? "ai_unavailable" : claim.code);
  }

  // Saved before the answer: a dropped connection loses the answer, never the question.
  await saveMessages(
    supabase,
    conversation.id,
    [merged.changed],
    trigger === "regenerate-message" ? merged.messages : undefined,
  );
  if (merged.changed.role === "user")
    await touchConversation(supabase, conversation, userText(merged.changed));

  const timeZone = (await viewerTimeZone()) ?? provider?.timezone ?? "UTC";
  const deps = {
    supabase,
    userId: user.id,
    timeZone,
    providerId: provider?.id ?? null,
    now: () => new Date(),
    searchCatalog: async (f: {
      query?: string;
      category?: string;
      city?: string;
      maxPrice?: number;
    }) =>
      (
        await searchProviders(
          parseCatalogQuery({
            q: f.query,
            category: f.category,
            city: f.city,
            maxPrice: f.maxPrice?.toString(),
          }),
        )
      ).items,
    getProvider: getProviderBySlug,
    freeSlots: ({
      provider: p,
      durationMin,
      date,
    }: {
      provider: { id: string; timezone: string };
      durationMin: number;
      date: string;
    }) =>
      loadFreeSlots({
        supabase,
        providerId: p.id,
        providerTimeZone: p.timezone,
        durationMin,
        date,
        viewerTimeZone: timeZone,
        now: new Date(),
      }),
    listBookings: () => listClientBookings(user.id),
    cancelBooking: (bookingId: string) => cancelAsUser(supabase, bookingId),
    searchDocuments: createDocumentSearch(supabase),
  };
  const tools = createChatTools(deps);

  // Stored messages are re-validated against today's tool schemas; an old, incompatible history
  // falls back to just the newest message instead of breaking the chat.
  const recent = trimHistory(merged.messages);
  const validated = await safeValidateUIMessages<ChatMessage>({ messages: recent, tools });
  const modelHistory = validated.success ? validated.data : [merged.changed];

  const todayKey = localToday(timeZone, new Date());
  const result = streamText({
    model: chatModel(),
    instructions: chatInstructions({
      today: new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(dateKeyToDate(todayKey)),
      todayKey,
      timeZone,
      userName: user.fullName,
      provider: provider ? { name: provider.displayName, slug: provider.slug } : null,
    }),
    messages: await convertToModelMessages(modelHistory, { tools }),
    tools,
    activeTools: activeChatTools(provider?.id ?? null),
    toolApproval: chatToolApproval(deps),
    experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET,
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // "Stop" in the chat aborts the request, and with it the model call: no tokens are paid for
    // an answer nobody reads.
    abortSignal: req.signal,
    onEnd: ({ usage }) =>
      finishAiRequest(claim.usageId, { model: chatModelId(), ...tokenCounts(usage) }),
    onError: ({ error }) => {
      log.error("chat.model_error", error, { conversationId: conversation.id });
      void finishAiRequest(claim.usageId, {
        model: chatModelId(),
        tokensIn: 0,
        tokensOut: 0,
        failed: true,
      });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof tools, ChatMessage>({
      stream: result.stream,
      tools,
      originalMessages: merged.messages,
      generateMessageId: nextMessageId,
      // The user sees a plain sentence; details stay in the server log.
      onError: () => "The assistant could not answer just now. Please try again.",
      onEnd: async ({ responseMessage }) => {
        // Also after "Stop": the partial answer stays in the history, as the user saw it.
        try {
          await saveMessages(supabase, conversation.id, [responseMessage]);
        } catch (error) {
          log.error("chat.save_failed", error, { conversationId: conversation.id });
        }
      },
    }),
  });
}
