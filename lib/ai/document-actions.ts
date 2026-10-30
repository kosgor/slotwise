"use server";

// Provider documents: upload, retry, delete. Files go to the private bucket and rows to
// provider_documents as the signed-in user — storage and table policies check ownership; the
// 5-document cap is a database trigger. Processing happens in the background (process-document).

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { documentUploaded } from "@/inngest/events";
import { getCurrentUser } from "@/lib/auth/session";
import { bookingErrorMessage } from "@/lib/booking/errors";
import { sendJobs } from "@/lib/jobs";
import { log } from "@/lib/log";
import { getOwnProvider } from "@/lib/provider/queries";
import { createClient } from "@/lib/supabase/server";

import { DOCUMENTS_BUCKET } from "./documents";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "./limits";

export type DocumentFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const uploadSchema = z.object({
  title: z.string().trim().min(2, "Give the document a short title.").max(120),
  file: z
    .instanceof(File, { message: "Choose a file." })
    .refine((f) => f.size > 0, "The file is empty.")
    .refine((f) => f.size <= MAX_DOCUMENT_BYTES, "Files can be up to 200 KB.")
    // Browsers report .md inconsistently ("" or text/x-markdown): the extension decides then.
    .refine(
      (f) => (DOCUMENT_TYPES as readonly string[]).includes(f.type) || /\.(txt|md)$/i.test(f.name),
      "Upload a .txt or .md file.",
    ),
});

const idSchema = z.object({ id: z.uuid() });

async function ownProvider() {
  const user = await getCurrentUser();
  return user ? getOwnProvider(user.id) : null;
}

export async function uploadDocument(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const provider = await ownProvider();
  if (!provider) return { status: "error", message: "Only providers can upload documents." };

  const parsed = uploadSchema.safeParse({
    title: formData.get("title"),
    file: formData.get("file"),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  const { title, file } = parsed.data;

  // Stored as UTF-8 plain text whatever the browser called it; a binary file fails here.
  const text = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
  if (text.includes("\u0000") || text.includes("�"))
    return { status: "error", fieldErrors: { file: ["This does not look like a text file."] } };

  const supabase = await createClient();
  const path = `${provider.id}/${crypto.randomUUID()}.txt`;
  const upload = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, new Blob([text], { type: "text/plain" }), { contentType: "text/plain" });
  if (upload.error) {
    log.error("documents.upload_failed", upload.error, { providerId: provider.id });
    return { status: "error", message: "The file could not be uploaded. Please try again." };
  }

  const { data: doc, error } = await supabase
    .from("provider_documents")
    .insert({
      provider_id: provider.id,
      title,
      storage_path: path,
      size_bytes: new TextEncoder().encode(text).length,
    })
    .select("id")
    .single();
  if (error || !doc) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return { status: "error", message: bookingErrorMessage(error) };
  }

  await sendJobs(documentUploaded.create({ documentId: doc.id }, { id: `${doc.id}:uploaded` }));
  revalidatePath("/dashboard/documents");
  return { status: "success", message: "Uploaded. The assistant can use it in a minute or two." };
}

export async function retryDocument(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { status: "error", message: "Unknown document." };
  const supabase = await createClient();
  // RLS: only the owner sees the row, so a stranger's id finds nothing to retry.
  const { data: doc } = await supabase
    .from("provider_documents")
    .select("id, title, status, updated_at")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!doc || doc.status !== "failed")
    return { status: "error", message: "This document is not waiting for a retry." };
  await sendJobs(
    documentUploaded.create({ documentId: doc.id }, { id: `${doc.id}:retry:${doc.updated_at}` }),
  );
  revalidatePath("/dashboard/documents");
  return {
    status: "success",
    message: `Processing “${doc.title}” again. It takes a minute or two.`,
  };
}

export async function deleteDocument(
  _prev: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { status: "error", message: "Unknown document." };
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("provider_documents")
    .delete()
    .eq("id", parsed.data.id)
    .select("title, storage_path")
    .maybeSingle();
  if (!doc) return { status: "error", message: "The document was already deleted." };
  // Chunks go with the row (on delete cascade); the file goes separately.
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  revalidatePath("/dashboard/documents");
  return {
    status: "success",
    message: `“${doc.title}” deleted. The concierge no longer answers from it.`,
  };
}
