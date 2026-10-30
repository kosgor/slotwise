// GET /api/chat/conversation?provider=<slug> — the signed-in user's latest chat about this provider
// (or their general chat without ?provider), so the chat on a static profile page can load history
// in the browser. Never cached: it is per user.

import { NextResponse, type NextRequest } from "next/server";

import { latestConversation } from "@/lib/ai/chat-store";
import { isAiConfigured } from "@/lib/ai/models";
import { aiRequestsLeft } from "@/lib/ai/usage";
import { getCurrentUser } from "@/lib/auth/session";
import { getProviderBySlug } from "@/lib/catalog/repository";
import { createClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("provider");
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ signedIn: false }, { headers: NO_STORE });

  const provider = slug ? await getProviderBySlug(slug.slice(0, 80)) : null;
  if (slug && !provider)
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const supabase = await createClient();
  const [conversation, left] = await Promise.all([
    latestConversation(supabase, provider?.id ?? null),
    aiRequestsLeft(supabase),
  ]);
  return NextResponse.json(
    {
      signedIn: true,
      available: isAiConfigured(),
      conversationId: conversation?.id ?? null,
      messages: conversation?.messages ?? [],
      requestsLeft: left,
    },
    { headers: NO_STORE },
  );
}
