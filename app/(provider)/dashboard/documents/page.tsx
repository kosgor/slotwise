import type { Metadata } from "next";
import { Suspense } from "react";

import { NoProviderProfile } from "@/components/features/dashboard/no-provider";
import { UploadDocumentForm } from "@/components/features/provider/document-forms";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/action-button";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteDocument, retryDocument } from "@/lib/ai/document-actions";
import { MAX_DOCUMENTS } from "@/lib/ai/limits";
import { formatDateTime } from "@/lib/datetime";
import { getProviderContext } from "@/lib/provider/context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documents", robots: { index: false } };

const STATUS = {
  uploaded: { label: "Waiting", className: "bg-muted text-muted-foreground" },
  processing: { label: "Processing", className: "bg-warning text-warning-foreground" },
  ready: { label: "Ready", className: "bg-success text-success-foreground" },
  failed: { label: "Failed", className: "bg-destructive text-white" },
} as const;

export default function DocumentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Documents />
    </Suspense>
  );
}

async function Documents() {
  const { provider } = await getProviderContext("/dashboard/documents");
  if (!provider) return <NoProviderProfile />;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_documents")
    .select("id, title, status, error, chunk_count, size_bytes, created_at")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: true });
  const documents = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Your policies, FAQ or “what to bring” notes. The AI concierge on your profile answers
          clients&apos; questions from them and names the document it used. Plain text only: do not
          upload anything private.
        </p>
      </div>

      <UploadDocumentForm disabled={documents.length >= MAX_DOCUMENTS} />
      <p className="text-sm text-muted-foreground">
        {documents.length} of {MAX_DOCUMENTS} documents.
      </p>

      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
          Documents could not be loaded. Refresh the page to try again.
        </p>
      ) : documents.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No documents yet. Without them, the concierge says “I don&apos;t know” to policy
          questions.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{d.title}</h2>
                  <Badge className={STATUS[d.status].className}>{STATUS[d.status].label}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {Math.ceil(d.size_bytes / 1000)} KB · uploaded{" "}
                  {formatDateTime(new Date(d.created_at), provider.timezone)}
                  {d.status === "ready" && ` · ${d.chunk_count} passages`}
                </p>
                {d.status === "failed" && d.error && (
                  <p className="mt-1 text-sm text-destructive">{d.error}</p>
                )}
              </div>
              <div className="flex gap-2">
                {d.status === "failed" && (
                  <ActionButton action={retryDocument} fields={{ id: d.id }} variant="outline">
                    Retry<span className="sr-only"> {d.title}</span>
                  </ActionButton>
                )}
                <ActionButton
                  action={deleteDocument}
                  fields={{ id: d.id }}
                  pendingLabel="Deleting…"
                  confirm={{
                    title: `Delete “${d.title}”?`,
                    description:
                      "The concierge stops answering from it right away. To use it again, upload the file again.",
                    label: "Delete document",
                  }}
                >
                  Delete<span className="sr-only"> {d.title}</span>
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
