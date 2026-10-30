/**
 * Validates a post-login destination from the URL (?next=…). Only same-site paths are allowed:
 * "/account" yes; "https://evil.com", "//evil.com" or "/\evil.com" no — otherwise a crafted
 * login link could send users to a phishing page right after they sign in (open redirect).
 */
export function safeNext(next: unknown, fallback = "/account"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    // Resolving against a dummy origin catches tricks like "/%2F%2Fevil.com" after decoding.
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
