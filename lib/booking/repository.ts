// Cached schedule reads. Busy intervals are NOT cached: they change with every booking and must be
// fresh when slots are shown. The database re-checks everything in book_slot() anyway.

import { cacheLife, cacheTag } from "next/cache";

import { loadSchedule } from "@/lib/catalog/source";

export const scheduleTag = (providerId: string) => `schedule:${providerId}`;

export async function getSchedule(providerId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog", scheduleTag(providerId));
  return loadSchedule(providerId);
}
