"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { BotIcon, MessageSquarePlusIcon, RotateCcwIcon, SendIcon, SquareIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage, ChatRequestBody } from "@/lib/ai/chat-types";
import { MAX_MESSAGE_CHARS } from "@/lib/ai/limits";
import { cn } from "@/lib/utils";

import { ToolPart } from "./tool-parts";

type Props = {
  conversationId: string;
  initialMessages: ChatMessage[];
  /** Chat about one provider (their profile page). */
  provider?: { slug: string; name: string };
  requestsLeft: number | null;
  suggestions?: string[];
};

/** The route answers errors as JSON ({ error, message }); the transport passes the body as text. */
function errorText(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Not JSON: a network error or a stream that broke off.
  }
  return "The connection was interrupted. Your message is saved; try again.";
}

/** Cards that are only steps towards a booking proposal. */
const STEP_TOOLS = new Set(["tool-searchProviders", "tool-getAvailableSlots"]);

/** The step cards of a message that ends in a booking proposal, or null if there is none. */
function proposalSteps(message: ChatMessage): ChatMessage["parts"] | null {
  const proposed = message.parts.some(
    (p) =>
      p.type === "tool-proposeBooking" &&
      p.state === "output-available" &&
      p.output.status === "proposed",
  );
  return proposed ? message.parts.filter((p) => STEP_TOOLS.has(p.type)) : null;
}

function plainText(message: ChatMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

/**
 * The chat with a "New chat" button. A new chat is a new conversation id: the old conversation stays
 * in the database, and the session below remounts (key) so useChat starts empty.
 */
export function ChatPanel({ conversationId, initialMessages, requestsLeft, ...rest }: Props) {
  const [session, setSession] = useState({
    id: conversationId,
    messages: initialMessages,
    fresh: false,
  });
  const [left, setLeft] = useState(requestsLeft);
  return (
    <ChatSession
      key={session.id}
      {...rest}
      conversationId={session.id}
      initialMessages={session.messages}
      startedFresh={session.fresh}
      left={left}
      onSpend={() => setLeft((n) => (n === null ? n : Math.max(0, n - 1)))}
      onNewChat={() => setSession({ id: crypto.randomUUID(), messages: [], fresh: true })}
    />
  );
}

function ChatSession({
  conversationId,
  initialMessages,
  provider,
  suggestions = [],
  startedFresh,
  left,
  onSpend,
  onNewChat,
}: Omit<Props, "requestsLeft"> & {
  startedFresh: boolean;
  left: number | null;
  onSpend: () => void;
  onNewChat: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const [input, setInput] = useState("");
  // Screen readers hear the finished answer once, not every streamed token (the log is not live).
  const [announcement, setAnnouncement] = useState(startedFresh ? "New conversation started." : "");
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        // Only the newest message: the server keeps the history and does not trust ours.
        prepareSendMessagesRequest: ({ id, messages, trigger }) => {
          const body: ChatRequestBody = {
            id,
            message: messages.at(-1)!,
            trigger,
            providerSlug: provider?.slug,
          };
          return { body };
        },
      }),
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    regenerate,
    error,
    clearError,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    // After "Yes, cancel" the answer goes back to the server to run the approved tool.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message, isAbort }) => {
      const text = plainText(message);
      setAnnouncement(
        isAbort
          ? "Stopped."
          : text
            ? `Assistant: ${text}`
            : "The assistant replied with a card. Use Tab to reach it.",
      );
    },
    onError: (e) => setAnnouncement(errorText(e)),
  });

  const busy = status === "submitted" || status === "streaming";

  // Keep the newest message in view while it streams.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    clearError();
    void sendMessage({ text: trimmed });
    setInput("");
    setAnnouncement("Sent. The assistant is answering…");
    onSpend();
  }

  // After "New chat" the button that was pressed is still there, but the conversation is new:
  // say so, and put the cursor where the next question goes.
  useEffect(() => {
    if (!startedFresh) return;
    inputRef.current?.focus();
  }, [startedFresh]);

  function respondToApproval(id: string, approved: boolean) {
    void addToolApprovalResponse({ id, approved });
  }

  const lastIsUser = messages.at(-1)?.role === "user";

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="flex min-h-[28rem] flex-col rounded-xl border bg-card"
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <BotIcon className="size-5 text-primary" aria-hidden="true" />
        <h2 id={`${inputId}-title`} className="font-semibold">
          {provider ? `Ask about ${provider.name}` : "Booking assistant"}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={busy || messages.length === 0}
          onClick={onNewChat}
        >
          <MessageSquarePlusIcon aria-hidden="true" />
          New chat
        </Button>
      </header>

      <div
        role="log"
        aria-live="off"
        aria-label="Conversation"
        aria-busy={busy || undefined}
        className="max-h-[32rem] flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              {provider
                ? `Ask about ${provider.name}'s services, free times or policies. I can also prepare a booking for you to confirm.`
                : "I can find a professional, check free times, prepare a booking for you to confirm, or cancel one."}
            </p>
            {suggestions.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <li key={s}>
                    <Button type="button" variant="outline" size="sm" onClick={() => send(s)}>
                      {s}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            aria-label={message.role === "user" ? "You" : "Assistant"}
            className={cn(
              "max-w-[90%] space-y-2 text-sm",
              message.role === "user" ? "ml-auto" : "mr-auto",
            )}
          >
            {message.parts.map((part, i) => {
              const steps = proposalSteps(message);
              if (steps && STEP_TOOLS.has(part.type)) {
                // The search and free-time cards led to the proposal: one collapsed group
                // in place of the first of them, so the proposal is what the user sees.
                if (message.parts.findIndex((p) => STEP_TOOLS.has(p.type)) !== i) return null;
                return (
                  <details key={i} className="rounded-xl border bg-background px-3 py-2">
                    <summary className="cursor-pointer text-muted-foreground">
                      How I found this time ({steps.length} {steps.length === 1 ? "step" : "steps"})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {steps.map((step, j) => (
                        <ToolPart
                          key={j}
                          part={step}
                          onApproval={respondToApproval}
                          onPickSlot={(label) => send(`Please book ${label}.`)}
                          disabled={busy}
                        />
                      ))}
                    </div>
                  </details>
                );
              }
              if (part.type === "text") {
                if (!part.text) return null;
                return (
                  <p
                    key={i}
                    className={cn(
                      "rounded-2xl px-3 py-2 whitespace-pre-wrap",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {part.text}
                  </p>
                );
              }
              if (part.type.startsWith("tool-"))
                return (
                  <ToolPart
                    key={i}
                    part={part}
                    onApproval={respondToApproval}
                    onPickSlot={(label) => send(`Please book ${label}.`)}
                    disabled={busy}
                  />
                );
              return null;
            })}
          </article>
        ))}

        {status === "submitted" && (
          <p className="mr-auto text-sm text-muted-foreground" aria-hidden="true">
            Thinking…
          </p>
        )}
        <div ref={logEndRef} />
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          <p className="flex-1">{errorText(error)}</p>
          {lastIsUser && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                clearError();
                void regenerate();
              }}
            >
              <RotateCcwIcon aria-hidden="true" />
              Try again
            </Button>
          )}
        </div>
      )}

      <form
        className="space-y-2 border-t p-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Label htmlFor={inputId}>Message</Label>
        <div className="flex items-end gap-2">
          <Textarea
            id={inputId}
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line; not while an IME is composing.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            maxLength={MAX_MESSAGE_CHARS}
            rows={1}
            aria-describedby={hintId}
            placeholder={provider ? `Ask about ${provider.name}…` : "Ask the assistant…"}
            // One line centred in the 44px of the Send button: 1px border + 9px padding + 24px line
            // on mobile (16px text), 11px padding + 20px line from md (14px text). Grows with the
            // text, then scrolls.
            className="max-h-40 min-h-11 resize-none py-[9px] md:py-[11px]"
          />
          {busy ? (
            <Button type="button" variant="outline" className="h-11" onClick={() => void stop()}>
              <SquareIcon aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button type="submit" className="h-11" disabled={!input.trim()}>
              <SendIcon aria-hidden="true" />
              Send
            </Button>
          )}
        </div>
        <p
          id={hintId}
          className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
        >
          <span>
            Enter to send, Shift+Enter for a new line. Nothing is booked or cancelled without your
            click.
          </span>
          <span>
            {input.length}/{MAX_MESSAGE_CHARS}
            {left !== null && ` · ${left} AI requests left today`}
          </span>
        </p>
      </form>
    </section>
  );
}
