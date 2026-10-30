"use client";

import { useEffect } from "react";

/**
 * Stores the browser's time zone in a cookie, so Server Components (bookings in /account and
 * /dashboard) can show times in the visitor's zone. Not personal data beyond what any page can read
 * with JavaScript; not used for tracking.
 */
export function TimezoneCookie() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!document.cookie.split("; ").includes(`tz=${encodeURIComponent(tz)}`)) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);
  return null;
}
