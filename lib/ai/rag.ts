// Retrieval: the question becomes an embedding, the database returns the closest chunks of one
// provider's documents above a similarity threshold. Runs with the user's session: which
// provider's documents may be searched is decided by match_document_chunks(), not here.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "ai";

import type { Database } from "@/lib/supabase/database.types";

import { embeddingModel, embeddingOptions } from "./models";

/** Below this cosine similarity a chunk is noise, not an answer. Tuned with evals/questions.json. */
export const MATCH_THRESHOLD = 0.6;
export const MATCH_COUNT = 4;

export type DocumentMatch = {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  similarity: number;
};

export type SearchDocuments = (providerId: string, question: string) => Promise<DocumentMatch[]>;

export function createDocumentSearch(supabase: SupabaseClient<Database>): SearchDocuments {
  return async (providerId, question) => {
    const { embedding } = await embed({
      model: embeddingModel(),
      value: question,
      providerOptions: embeddingOptions("RETRIEVAL_QUERY"),
    });
    const { data, error } = await supabase.rpc("match_document_chunks", {
      p_provider_id: providerId,
      p_embedding: JSON.stringify(embedding),
      p_threshold: MATCH_THRESHOLD,
      p_limit: MATCH_COUNT,
    });
    if (error) throw new Error(`Document search failed: ${error.message}`);
    return data.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      content: row.content,
      similarity: row.similarity,
    }));
  };
}
