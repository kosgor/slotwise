import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { displayStatus } from "./status";
import type { Booking } from "./types";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    providerId: row.provider_id,
    clientId: row.client_id,
    serviceId: row.service_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    priceCents: row.price_cents,
    currency: row.currency,
    serviceTitle: row.service_title,
    durationMin: row.duration_min,
    providerName: row.provider_name,
    providerTimezone: row.provider_timezone,
    clientName: row.client_name,
    clientEmail: row.client_email,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidCents: row.paid_cents,
    refundedCents: row.refunded_cents,
    rescheduledAt: row.rescheduled_at,
  };
}

/** Bookings the user made as a client. RLS would also return bookings *with* them as a provider,
 *  so the client_id filter is part of the meaning, not of the security. */
export async function listClientBookings(userId: string): Promise<Booking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("client_id", userId)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to load bookings: ${error.message}`);
  return data.map(toBooking);
}

export async function listProviderBookings(
  providerId: string,
  range?: { from: Date; to: Date },
): Promise<Booking[]> {
  const supabase = await createClient();
  let query = supabase.from("bookings").select("*").eq("provider_id", providerId);
  if (range)
    query = query
      .gte("starts_at", range.from.toISOString())
      .lt("starts_at", range.to.toISOString());
  const { data, error } = await query.order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to load bookings: ${error.message}`);
  return data.map(toBooking);
}

export type BookingTab = "upcoming" | "past" | "cancelled";

export function bookingTab(booking: Booking, now: Date): BookingTab {
  const status = displayStatus(booking, now);
  if (status === "cancelled" || status === "expired") return "cancelled";
  return new Date(booking.startsAt) >= now ? "upcoming" : "past";
}
