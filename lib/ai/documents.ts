// Provider documents for the concierge: text → chunks → embeddings → document_chunks.
// Runs in the background job (inngest/functions.tsx) with the server key.

import "server-only";

import { embedMany } from "ai";

import type { AdminClient } from "@/lib/supabase/admin";

import { chunkText } from "./chunking";
import { embeddingModel, embeddingModelId, embeddingOptions } from "./models";
import { recordEmbeddingUsage } from "./usage";

export const DOCUMENTS_BUCKET = "provider-documents";

export async function markDocument(
  admin: AdminClient,
  documentId: string,
  status: "processing" | "failed",
  error?: string,
) {
  const { error: dbError } = await admin
    .from("provider_documents")
    .update({ status, error: error ? error.slice(0, 300) : null })
    .eq("id", documentId);
  if (dbError) throw new Error(`Document ${documentId}: ${dbError.message}`);
}

/**
 * Embeds and stores one document. Idempotent: replace_document_chunks() swaps all chunks in one
 * transaction, so a retried run leaves exactly one set. Returns the number of chunks.
 */
export async function embedDocument(admin: AdminClient, documentId: string): Promise<number> {
  const { data: doc, error } = await admin
    .from("provider_documents")
    .select("id, provider_id, storage_path, title, providers(user_id)")
    .eq("id", documentId)
    .single();
  if (error) throw new Error(`Document ${documentId}: ${error.message}`);

  const file = await admin.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
  if (file.error) throw new Error(`Download ${doc.storage_path}: ${file.error.message}`);
  const chunks = chunkText(await file.data.text());
  if (chunks.length === 0) throw new EmptyDocumentError();

  const { embeddings, usage } = await embedMany({
    model: embeddingModel(),
    values: chunks.map((c) => c.content),
    providerOptions: embeddingOptions("RETRIEVAL_DOCUMENT"),
    maxParallelCalls: 2,
  });

  const { data: count, error: saveError } = await admin.rpc("replace_document_chunks", {
    p_document_id: documentId,
    p_chunks: chunks.map((c, i) => ({
      content: c.content,
      embedding: JSON.stringify(embeddings[i]),
      metadata: { title: doc.title, chunk: c.index },
    })),
  });
  if (saveError) throw new Error(`Save chunks: ${saveError.message}`);

  await recordEmbeddingUsage({
    providerId: doc.provider_id,
    userId: doc.providers?.user_id ?? null,
    model: embeddingModelId(),
    // Gemini does not report embedding tokens; then the cost is estimated from the text
    // (about 4 characters per token), so spend is never recorded as zero.
    tokens: usage?.tokens ?? Math.ceil(chunks.reduce((n, c) => n + c.content.length, 0) / 4),
  });
  return count;
}

export class EmptyDocumentError extends Error {
  constructor() {
    super("The document has no text.");
  }
}
