"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A new page starts at the very top. Next.js scrolls only to the top of the page segment, which
 * sits below the sticky header (in the root layout), so it stopped 65px short. Runs after Next's own
 * scroll on every pathname change, except:
 * - Back/Forward (popstate): the browser restores where the visitor was;
 * - a link to an anchor (#faq): the browser scrolls to it;
 * - same-page URL changes (filters, sorting, pages with scroll={false}): the pathname stays.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  // Compared with the last path, not a "first render" flag: Strict Mode runs effects twice, and a
  // reload must keep the position the browser restores.
  const last = useRef(pathname);
  // The path Back/Forward went to: only that navigation keeps the restored position. A path, not
  // a flag, so a Back that changed only the query cannot swallow the next real navigation.
  const popped = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      popped.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    const restored = popped.current === pathname;
    popped.current = null;
    if (restored) return;
    if (window.location.hash) return;
    // "instant": the html element has scroll-behavior: smooth for in-page anchors.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
