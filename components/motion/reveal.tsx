import { cn } from "@/lib/utils";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Stagger index: later items start their fade a little later in the scroll. */
  index?: number;
  as?: "div" | "section" | "li";
};

/**
 * Fades content in as it scrolls into view — pure CSS (scroll-driven animations, see `.reveal`
 * in globals.css), no JavaScript. Browsers without support, users with reduced motion and
 * clients without JS simply see the content immediately. See docs/decisions/0005.
 * Do not wrap above-the-fold content (hero).
 */
export function Reveal({ children, className, index = 0, as: Component = "div" }: RevealProps) {
  return (
    <Component
      className={cn("reveal", className)}
      style={{ "--reveal-index": index } as React.CSSProperties}
    >
      {children}
    </Component>
  );
}
