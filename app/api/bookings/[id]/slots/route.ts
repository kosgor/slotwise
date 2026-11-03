// GET /api/bookings/:id/slots?date=YYYY-MM-DD&tz=Europe/London — free start times for moving one
// of the signed-in user's bookings, on one calendar day in the viewer's time zone. RLS decides who
// may read the booking (its client or its provider); reschedule_booking() re-checks everything.
// The length comes from the booking, and its own time does not count as busy.

import { NextResponse, type NextRequest } from "next/server";

import { loadFreeSlots } from "@/lib/booking/availability";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { rescheduleSlotsSchema } from "@/lib/validation/booking";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/bookings/[id]/slots">,
) {
  const parsed = rescheduleSlotsSchema.safeParse({
    bookingId: (await params).id,
    date: request.nextUrl.searchParams.get("date"),
    tz: request.nextUrl.searchParams.get("tz"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers: NO_STORE });
  }
  const { bookingId, date, tz } = parsed.data;

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("provider_id, starts_at, ends_at, duration_min, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }

  // The provider's schedule is public only while the profile is approved, and so is moving.
  const publicClient = createPublicClient();
  const { data: provider } = await publicClient
    .from("providers")
    .select("timezone")
    .eq("id", booking.provider_id)
    .maybeSingle();
  if (!provider || booking.status !== "confirmed") {
    return NextResponse.json({ error: "not_reschedulable" }, { status: 409, headers: NO_STORE });
  }

  const slots = await loadFreeSlots({
    supabase: publicClient,
    providerId: booking.provider_id,
    providerTimeZone: provider.timezone,
    durationMin: booking.duration_min,
    date,
    viewerTimeZone: tz,
    now: new Date(),
    ignore: { startsAt: new Date(booking.starts_at), endsAt: new Date(booking.ends_at) },
  });
  if (!slots) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ slots: slots.map((s) => s.toISOString()) }, { headers: NO_STORE });
}
