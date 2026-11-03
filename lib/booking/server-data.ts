// Booking data for code without a user session (background jobs): read with the service role.

import "server-only";

import type { EmailBooking } from "@/emails/booking-emails";
import { formatDuration, formatPrice } from "@/lib/catalog/format";
import { formatDateTime, zoneLabel } from "@/lib/datetime";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export async function loadBooking(admin: AdminClient, bookingId: string): Promise<BookingRow> {
  const { data, error } = await admin.from("bookings").select("*").eq("id", bookingId).single();
  if (error) throw new Error(`Booking ${bookingId}: ${error.message}`);
  return data;
}

/** The provider's sign-in email, or null for seeded profiles that no account owns. */
export async function providerEmail(
  admin: AdminClient,
  providerId: string,
): Promise<string | null> {
  const { data: provider } = await admin
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();
  if (!provider?.user_id) return null;
  const { data } = await admin.auth.admin.getUserById(provider.user_id);
  return data.user?.email ?? null;
}

/** "Tuesday 3 November 2026, 10:00 (London time)": a time for emails, with the zone named. */
export function emailWhen(iso: string, timeZone: string): string {
  return `${formatDateTime(new Date(iso), timeZone)} (${zoneLabel(timeZone)})`;
}

/** Display strings for email templates. Times in the provider's zone, with the zone named. */
export function toEmailBooking(b: BookingRow): EmailBooking {
  return {
    serviceTitle: b.service_title,
    when: emailWhen(b.starts_at, b.provider_timezone),
    duration: formatDuration(b.duration_min),
    price: b.price_cents === 0 ? "Free" : formatPrice(b.price_cents, b.currency),
    providerName: b.provider_name,
    clientName: b.client_name,
  };
}
