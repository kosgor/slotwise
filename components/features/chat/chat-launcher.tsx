"use client";

import { BotIcon, Loader2Icon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chat-types";

// The chat (AI SDK + UI) loads only when someone opens it: profile pages stay light and static.
const ChatPanel = dynamic(() => import("./chat-panel").then((m) => m.ChatPanel), {
  ssr: false,
  loading: () => <LoadingLine />,
});

type Loaded =
  | { kind: "signed-out" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; conversationId: string; messages: ChatMessage[]; requestsLeft: number | null };

function LoadingLine() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      Opening the chat…
    </p>
  );
}

/** "Ask the AI concierge" on a provider's profile. History is per user, so it loads in the browser. */
export function ProviderChat({ slug, name }: { slug: string; name: string }) {
  const [state, setState] = useState<Loaded | "closed" | "loading">("closed");
  const regionRef = useRef<HTMLDivElement>(null);

  async function open() {
    setState("loading");
    try {
      const res = await fetch(`/api/chat/conversation?provider=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) setState({ kind: "error" });
      else if (!data.signedIn) setState({ kind: "signed-out" });
      else if (!data.available) setState({ kind: "unavailable" });
      else
        setState({
          kind: "ready",
          conversationId: data.conversationId ?? crypto.randomUUID(),
          messages: data.messages,
          requestsLeft: data.requestsLeft,
        });
    } catch {
      setState({ kind: "error" });
    }
    // The button that opened the chat is gone: move focus into what replaced it.
    requestAnimationFrame(() => regionRef.current?.focus());
  }

  return (
    <section aria-labelledby="concierge-title">
      <h2 id="concierge-title" className="text-xl font-semibold">
        Questions?
      </h2>
      <div ref={regionRef} tabIndex={-1} className="mt-3 outline-none">
        {state === "closed" && (
          <div className="rounded-xl border border-dashed p-5">
            <p className="text-sm text-muted-foreground">
              Ask our AI concierge about {name}&apos;s services, free times and policies — answers
              cite {name}&apos;s own documents.
            </p>
            <Button type="button" variant="outline" className="mt-3" onClick={open}>
              <BotIcon aria-hidden="true" />
              Ask the AI concierge
            </Button>
          </div>
        )}
        {state === "loading" && <LoadingLine />}
        {typeof state === "object" && state.kind === "signed-out" && (
          <p className="rounded-xl border border-dashed p-5 text-sm">
            <Link
              href={`/login?next=${encodeURIComponent(`/pros/${slug}`)}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>{" "}
            to chat with the concierge. It can see your bookings, so it needs to know who you are.
          </p>
        )}
        {typeof state === "object" && state.kind === "unavailable" && (
          <p
            role="status"
            className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground"
          >
            The AI concierge is not available right now. You can still book directly.
          </p>
        )}
        {typeof state === "object" && state.kind === "error" && (
          <div role="alert" className="rounded-xl border border-destructive/40 p-5 text-sm">
            <p>The chat could not be opened.</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={open}>
              Try again
            </Button>
          </div>
        )}
        {typeof state === "object" && state.kind === "ready" && (
          <ChatPanel
            conversationId={state.conversationId}
            initialMessages={state.messages}
            provider={{ slug, name }}
            requestsLeft={state.requestsLeft}
            suggestions={[
              "What is the cancellation policy?",
              "What times are free this week?",
              "What should I bring?",
            ]}
          />
        )}
      </div>
    </section>
  );
}
