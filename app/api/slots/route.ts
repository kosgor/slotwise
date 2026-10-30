// GET /api/slots?provider=…&service=…&date=YYYY-MM-DD&tz=Europe/Warsaw
// Free start times for one service on one calendar day *in the visitor's time zone*.
// Public (anyone can see free times), never cached (bookings change it), validated with Zod.

import { NextResponse, type NextRequest } from "next/server";

import { loadFreeSlots } from "@/lib/booking/availability";
import { getProviderBySlug } from "@/lib/catalog/repository";
import { createPublicClient } from "@/lib/supabase/public";
import { slotsQuerySchema } from "@/lib/validation/booking";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const parsed = slotsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400, headers: NO_STORE });
  }
  const { provider: providerId, service: serviceId, date, tz } = parsed.data;
  const slug = request.nextUrl.searchParams.get("slug") ?? "";

  // The provider and service come from the (cached) catalog: only approved providers and active
  // services exist there, so unknown or hidden ids simply return 404.
  const provider = await getProviderBySlug(slug);
  const service = provider?.services.find((s) => s.id === serviceId);
  if (!provider || provider.id !== providerId || !service) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }

  const slots = await loadFreeSlots({
    supabase: createPublicClient(),
    providerId,
    providerTimeZone: provider.timezone,
    durationMin: service.durationMin,
    date,
    viewerTimeZone: tz,
    now: new Date(),
  });
  if (!slots) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ slots: slots.map((s) => s.toISOString()) }, { headers: NO_STORE });
}
