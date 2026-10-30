// What the server accepts from the browser. The browser could send anything, so the stored
// history is the truth and only two things come from the request:
//   * a new user message (text only, length-limited);
//   * the user's approve/deny answer on a pending tool approval of the last assistant message.
// Pure functions, tested in tests/unit/ai-chat-messages.test.ts.

import type { ChatMessage } from "./chat-types";
import { HISTORY_MESSAGES, MAX_MESSAGE_CHARS } from "./limits";

export type MergeResult =
  | { ok: true; messages: ChatMessage[]; changed: ChatMessage }
  | { ok: false; error: "empty_message" | "message_too_long" | "unknown_message" };

export function userText(message: ChatMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

export function mergeIncomingMessage(
  history: ChatMessage[],
  incoming: ChatMessage,
  trigger: "submit-message" | "regenerate-message",
): MergeResult {
  if (incoming.role === "user") {
    const text = userText(incoming);
    if (!text) return { ok: false, error: "empty_message" };
    if (text.length > MAX_MESSAGE_CHARS) return { ok: false, error: "message_too_long" };
    const clean: ChatMessage = { id: incoming.id, role: "user", parts: [{ type: "text", text }] };

    const existing = history.findIndex((m) => m.id === incoming.id);
    if (existing !== -1) {
      // Regenerate (or a resend after a dropped connection): answer this message again, forget
      // what came after it.
      if (trigger !== "regenerate-message" && existing !== history.length - 1)
        return { ok: false, error: "unknown_message" };
      return { ok: true, messages: [...history.slice(0, existing), clean], changed: clean };
    }
    return { ok: true, messages: [...history, clean], changed: clean };
  }

  if (incoming.role === "assistant") {
    const last = history.at(-1);
    if (!last || last.id !== incoming.id || last.role !== "assistant")
      return { ok: false, error: "unknown_message" };

    let answered = 0;
    const parts = last.parts.map((part) => {
      if (!("state" in part) || part.state !== "approval-requested" || !("toolCallId" in part))
        return part;
      const reply = incoming.parts.find(
        (p) => "toolCallId" in p && p.toolCallId === part.toolCallId,
      );
      if (
        !reply ||
        !("state" in reply) ||
        reply.state !== "approval-responded" ||
        typeof reply.approval?.approved !== "boolean"
      )
        return part;
      answered++;
      return {
        ...part,
        state: "approval-responded" as const,
        approval: {
          ...part.approval,
          approved: reply.approval.approved,
          reason:
            typeof reply.approval.reason === "string"
              ? reply.approval.reason.slice(0, 200)
              : undefined,
        },
      };
    }) as ChatMessage["parts"];
    if (answered === 0) return { ok: false, error: "unknown_message" };

    const changed: ChatMessage = { ...last, parts };
    return { ok: true, messages: [...history.slice(0, -1), changed], changed };
  }

  return { ok: false, error: "unknown_message" };
}

/**
 * The part of the history that goes to the model: the last HISTORY_MESSAGES messages, starting
 * with a user message (a cut in the middle of a tool exchange would confuse the model).
 */
export function trimHistory(messages: ChatMessage[], max = HISTORY_MESSAGES): ChatMessage[] {
  if (messages.length <= max) return messages;
  const recent = messages.slice(-max);
  const firstUser = recent.findIndex((m) => m.role === "user");
  return firstUser <= 0 ? recent : recent.slice(firstUser);
}
