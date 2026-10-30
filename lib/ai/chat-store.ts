// Chat history in Supabase, read and written as the signed-in user (RLS: own conversations only).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/database.types";

import type { ChatMessage } from "./chat-types";

type Client = SupabaseClient<Database>;

export type Conversation = { id: string; providerId: string | null; title: string };

/** The user's conversation with this id, created if it does not exist yet. Null: not theirs. */
export async function openConversation(
  supabase: Client,
  id: string,
  providerId: string | null,
): Promise<Conversation | null> {
  const { data: found } = await supabase
    .from("conversations")
    .select("id, provider_id, title")
    .eq("id", id)
    .maybeSingle();
  if (found) {
    // A conversation stays about the provider it was started with.
    if (found.provider_id !== providerId) return null;
    return { id: found.id, providerId: found.provider_id, title: found.title };
  }
  // Insert fails if the id belongs to someone else (primary key) — RLS hid it from the select.
  const { data, error } = await supabase
    .from("conversations")
    .insert({ id, provider_id: providerId })
    .select("id, provider_id, title")
    .single();
  if (error || !data) return null;
  return { id: data.id, providerId: data.provider_id, title: data.title };
}

export async function loadMessages(
  supabase: Client,
  conversationId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, parts")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return data.map((m) => ({
    id: m.id,
    role: m.role as ChatMessage["role"],
    parts: m.parts as unknown as ChatMessage["parts"],
  }));
}

/**
 * Inserts new messages and updates the parts of existing ones; with `keep`, removes stored messages
 * not in it (regenerate). Not an upsert: ON CONFLICT DO UPDATE writes every column, and users may
 * only update `parts` (a message cannot change its role or move to another conversation).
 */
export async function saveMessages(
  supabase: Client,
  conversationId: string,
  messages: ChatMessage[],
  keep?: ChatMessage[],
): Promise<void> {
  if (keep) {
    const ids = keep.map((m) => m.id);
    let remove = supabase.from("messages").delete().eq("conversation_id", conversationId);
    if (ids.length) remove = remove.not("id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
    const { error } = await remove;
    if (error) throw new Error(`Failed to trim messages: ${error.message}`);
  }
  if (messages.length === 0) return;

  const { data: stored, error: readError } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .in(
      "id",
      messages.map((m) => m.id),
    );
  if (readError) throw new Error(`Failed to save messages: ${readError.message}`);
  const existing = new Set(stored.map((m) => m.id));

  const fresh = messages.filter((m) => !existing.has(m.id));
  if (fresh.length) {
    const { error } = await supabase.from("messages").insert(
      fresh.map((m) => ({
        conversation_id: conversationId,
        id: m.id,
        role: m.role,
        parts: m.parts as unknown as Json,
      })),
    );
    if (error) throw new Error(`Failed to save messages: ${error.message}`);
  }
  for (const m of messages.filter((m) => existing.has(m.id))) {
    const { error } = await supabase
      .from("messages")
      .update({ parts: m.parts as unknown as Json })
      .eq("conversation_id", conversationId)
      .eq("id", m.id);
    if (error) throw new Error(`Failed to save messages: ${error.message}`);
  }
}

export async function touchConversation(
  supabase: Client,
  conversation: Conversation,
  title: string,
) {
  await supabase
    .from("conversations")
    .update(
      conversation.title
        ? { updated_at: new Date().toISOString() }
        : { title: title.slice(0, 120), updated_at: new Date().toISOString() },
    )
    .eq("id", conversation.id);
}

/** Most recent conversation of the user in this context (a provider's page, or the account). */
export async function latestConversation(
  supabase: Client,
  providerId: string | null,
): Promise<{ id: string; messages: ChatMessage[] } | null> {
  let query = supabase.from("conversations").select("id");
  query = providerId ? query.eq("provider_id", providerId) : query.is("provider_id", null);
  const { data } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { id: data.id, messages: await loadMessages(supabase, data.id) };
}
