import { PageTransition } from "@/components/motion/page-transition";

// template.tsx (unlike layout.tsx) remounts on every navigation — that is what triggers the transition.
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
