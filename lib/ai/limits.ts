// AI limits. The database enforces the request limits inside claim_ai_request() and the document
// limits in provider_documents (supabase/migrations/20261023000000_ai_concierge.sql); tests/rls
// checks they agree. Change one — change both.

/** AI requests per UTC day: chat messages, profile drafts and weekly summaries together. */
export const DAILY_AI_REQUESTS = { free: 30, pro: 150 } as const;
/** Requests per user per minute, whatever the plan: stops scripts and runaway retries. */
export const RATE_LIMIT_PER_MINUTE = 6;

/** Longest chat message a user can send. */
export const MAX_MESSAGE_CHARS = 1000;
/** Messages of history sent to the model; older ones stay in the database, not in the prompt. */
export const HISTORY_MESSAGES = 20;
/** Longest answer the model may write. */
export const MAX_OUTPUT_TOKENS = 800;
/** Model calls per chat turn (tool call → result → answer, up to this many rounds). */
export const MAX_STEPS = 5;

/** Per provider; each document costs embeddings once. */
export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_BYTES = 200_000;
export const DOCUMENT_TYPES = ["text/plain", "text/markdown"] as const;
