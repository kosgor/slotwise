"use client";

import { ThemeProvider } from "next-themes";

import { PageTransitionProvider } from "@/components/motion/page-transition";

// Motion is intentionally not here: it is scoped to the one component that needs it
// (pricing toggle), so other pages do not download it. See docs/decisions/0005.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PageTransitionProvider>{children}</PageTransitionProvider>
    </ThemeProvider>
  );
}
