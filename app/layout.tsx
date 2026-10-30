import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";

import { LazyToaster } from "@/components/lazy-toaster";
import { Providers } from "@/components/providers";
import { ScrollToTop } from "@/components/scroll-to-top";
import { JsonLd } from "@/components/seo/json-ld";
import { TimezoneCookie } from "@/components/timezone-cookie";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/json-ld";
import { site } from "@/lib/site";

import "./globals.css";

// Fonts live in the repo (app/fonts) instead of being downloaded from Google at build time:
// builds work offline and are reproducible. next/font/local still adds preload, font-display and
// a metric-matched fallback so text does not jump when the font arrives.
const geistSans = localFont({
  src: "./fonts/Geist-Variable-latin.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMono-Variable-latin.woff2",
  variable: "--font-mono",
  weight: "100 900",
  display: "swap",
  // Mono is used in a few small places (design system, error IDs): do not compete with page content.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — book independent professionals`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: { type: "website", siteName: site.name, locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Browser extensions (Grammarly and others) add attributes to <body> before React hydrates.
          This only skips the check of <body>'s own attributes, not of anything inside it. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        {/* Long enough to read the longer notices (refund timing); hovering or focusing pauses it. */}
        <LazyToaster closeButton duration={6000} />
        <TimezoneCookie />
        {/* usePathname inside: its own Suspense boundary keeps the shell prerenderable. */}
        <Suspense fallback={null}>
          <ScrollToTop />
        </Suspense>
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
      </body>
    </html>
  );
}
