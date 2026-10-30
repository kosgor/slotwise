"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";

// Counts page mounts across client navigations. The provider lives in the root layout,
// which is not remounted on navigation, while template.tsx (and PageTransition) is.
// Returns true for the very first mount (the initial page load).
const RegisterMount = createContext<(() => boolean) | null>(null);

export function PageTransitionProvider({ children }: { children: React.ReactNode }) {
  const mountsRef = useRef(0);
  const registerMount = useCallback(() => {
    const isFirst = mountsRef.current === 0;
    mountsRef.current += 1;
    return isFirst;
  }, []);
  return <RegisterMount.Provider value={registerMount}>{children}</RegisterMount.Provider>;
}

/**
 * Fades the page in on client-side navigation only.
 * The first page load is never animated: content must be visible in the server HTML
 * (LCP, users without JavaScript, crawlers), so we animate from JS after mount.
 * Uses the browser's Web Animations API directly — a one-off fade needs no library.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const registerMount = useContext(RegisterMount);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isFirstLoad = registerMount?.() ?? true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isFirstLoad || reduceMotion || !ref.current) return;
    ref.current.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 250, easing: "ease-out" },
    );
  }, [registerMount]);

  return (
    <div ref={ref} className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
