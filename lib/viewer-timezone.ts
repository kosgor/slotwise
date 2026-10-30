import "server-only";

import { cookies } from "next/headers";

import { isValidTimeZone } from "@/lib/datetime";

/** The visitor's time zone from the `tz` cookie (set by <TimezoneCookie />), or null if unknown. */
export async function viewerTimeZone(): Promise<string | null> {
  const raw = (await cookies()).get("tz")?.value;
  const tz = raw ? decodeURIComponent(raw) : null;
  return isValidTimeZone(tz) ? tz : null;
}
