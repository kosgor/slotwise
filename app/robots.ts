import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

// Private areas are excluded for every crawler. AI crawlers are named explicitly and allowed:
// being cited by ChatGPT, Claude or Perplexity is a goal (AEO), not a threat, for a public catalog.
const PRIVATE = ["/api/", "/account", "/dashboard", "/admin", "/pros/*/book"];
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
