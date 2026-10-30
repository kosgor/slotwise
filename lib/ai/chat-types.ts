// Message type shared by the chat route and the chat UI. Type-only import: no server code reaches
// the browser bundle.

import type { InferUITools, UIDataTypes, UIMessage } from "ai";

import type { ChatTools } from "./tools";

export type ChatUITools = InferUITools<ChatTools>;
export type ChatMessage = UIMessage<unknown, UIDataTypes, ChatUITools>;

/** Body the chat UI posts to /api/chat: only the newest message — history lives in the database. */
export type ChatRequestBody = {
  id: string;
  message: ChatMessage;
  trigger: "submit-message" | "regenerate-message";
  providerSlug?: string;
};
