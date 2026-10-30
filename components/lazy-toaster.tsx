"use client";

import dynamic from "next/dynamic";

// Toasts are never needed for the first paint, so sonner loads after hydration
// instead of being part of every page's initial JavaScript.
export const LazyToaster = dynamic(
  () => import("@/components/ui/sonner").then((mod) => mod.Toaster),
  {
    ssr: false,
  },
);
