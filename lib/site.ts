export const site = {
  name: "Slotwise",
  description:
    "Find and book independent tutors, trainers, coaches and massage therapists. Real availability, clear prices, instant booking.",
  // Public, non-secret value: safe to expose via NEXT_PUBLIC_.
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  email: "hello@slotwise.dev",
} as const;

export const absoluteUrl = (path = "/") => `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
