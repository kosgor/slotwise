export const site = {
  name: "Slotwise",
  description:
    "Find and book independent tutors, trainers, coaches and massage therapists. Real availability, clear prices, instant booking.",
  // Public, non-secret value: safe to expose via NEXT_PUBLIC_. On Vercel without NEXT_PUBLIC_SITE_URL,
  // the project's production domain (set by Vercel), so sitemap and canonical links never say localhost.
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, ""),
  email: "hello@slotwise.dev",
} as const;

export const absoluteUrl = (path = "/") => `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
