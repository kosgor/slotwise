// Free start times of one service on one calendar day in the viewer's time zone: the cached
// schedule plus fresh busy intervals. Used by GET /api/slots, GET /api/bookings/[id]/slots (moving a
// booking) and by the AI concierge's tools.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { getSchedule } from "./repository";
import { getAvailableSlots, localDayRange } from "./slots";

export type FreeSlotsInput = {
  /** Any client allowed to call provider_busy_intervals (anon or a signed-in user). */
  supabase: SupabaseClient<Database>;
  providerId: string;
  providerTimeZone: string;
  durationMin: number;
  /** "YYYY-MM-DD" in viewerTimeZone. */
  date: string;
  viewerTimeZone: string;
  now: Date;
  /** A booking being moved: its own time does not count as busy (it may move by half an hour). */
  ignore?: { startsAt: Date; endsAt: Date };
};

/** Free slots, or null when busy times could not be loaded (show "unavailable", not "none"). */
export async function loadFreeSlots(input: FreeSlotsInput): Promise<Date[] | null> {
  const { from, to } = localDayRange(input.date, input.viewerTimeZone);
  const [schedule, busy] = await Promise.all([
    getSchedule(input.providerId),
    input.supabase.rpc("provider_busy_intervals", {
      p_provider_id: input.providerId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    }),
  ]);
  if (busy.error) return null;

  return getAvailableSlots({
    ...schedule,
    busy: busy.data
      .map((b) => ({ startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) }))
      .filter(
        (b) =>
          !input.ignore ||
          b.startsAt.getTime() !== input.ignore.startsAt.getTime() ||
          b.endsAt.getTime() !== input.ignore.endsAt.getTime(),
      ),
    durationMin: input.durationMin,
    timeZone: input.providerTimeZone,
    from,
    to,
    now: input.now,
  });
}
