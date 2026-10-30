// GET /api/bookings/:id — payment status of one of the signed-in user's bookings. Polled by the
// payment page while it waits for the Stripe webhook. RLS decides what the user may read: someone
// else's booking simply is not found.

import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: RouteContext<"/api/bookings/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("status, expires_at, paid_cents, refunded_cents")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(
    {
      status: data.status,
      expiresAt: data.expires_at,
      paidCents: data.paid_cents,
      refundedCents: data.refunded_cents,
    },
    { headers: NO_STORE },
  );
}
