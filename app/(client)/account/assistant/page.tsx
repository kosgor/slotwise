import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ChatPanel } from "@/components/features/chat/chat-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { latestConversation } from "@/lib/ai/chat-store";
import { isAiConfigured } from "@/lib/ai/models";
import { aiRequestsLeft } from "@/lib/ai/usage";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Booking assistant", robots: { index: false } };

export default function AssistantPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Booking assistant</h1>
        <p className="mt-1 text-muted-foreground">
          Find a professional, check free times, book or cancel — in plain words.{" "}
          <Link
            href="/account"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to My bookings
          </Link>
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
        <Assistant />
      </Suspense>
    </div>
  );
}

async function Assistant() {
  await requireUser("/account/assistant");
  if (!isAiConfigured()) {
    return (
      <p
        role="status"
        className="rounded-xl border border-dashed p-10 text-center text-muted-foreground"
      >
        The assistant is not available right now. You can still{" "}
        <Link href="/pros" className="font-medium text-primary underline-offset-4 hover:underline">
          book from the catalog
        </Link>
        .
      </p>
    );
  }
  const supabase = await createClient();
  const [conversation, left] = await Promise.all([
    latestConversation(supabase, null),
    aiRequestsLeft(supabase),
  ]);
  return (
    <ChatPanel
      conversationId={conversation?.id ?? crypto.randomUUID()}
      initialMessages={conversation?.messages ?? []}
      requestsLeft={left}
      suggestions={[
        "Find a yoga teacher in London under £60",
        "What are my upcoming bookings?",
        "I need to cancel my next session",
      ]}
    />
  );
}
