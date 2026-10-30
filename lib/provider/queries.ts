import "server-only";

import { cache } from "react";

import type { AvailabilityException, AvailabilityRule } from "@/lib/booking/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type OwnProvider = Database["public"]["Tables"]["providers"]["Row"];
export type OwnService = Database["public"]["Tables"]["services"]["Row"];

const hhmm = (time: string) => time.slice(0, 5);

/** The signed-in user's own provider profile (any status — RLS lets owners see pending ones). */
export const getOwnProvider = cache(async (userId: string): Promise<OwnProvider | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load provider: ${error.message}`);
  return data;
});

export async function getOwnServices(providerId: string): Promise<OwnService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("provider_id", providerId)
    .order("active", { ascending: false })
    .order("price_cents");
  if (error) throw new Error(`Failed to load services: ${error.message}`);
  return data;
}

export async function getOwnSchedule(
  providerId: string,
): Promise<{ rules: AvailabilityRule[]; exceptions: AvailabilityException[] }> {
  const supabase = await createClient();
  const [rules, exceptions] = await Promise.all([
    supabase
      .from("availability_rules")
      .select("*")
      .eq("provider_id", providerId)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("availability_exceptions")
      .select("*")
      .eq("provider_id", providerId)
      .order("date"),
  ]);
  if (rules.error) throw new Error(rules.error.message);
  if (exceptions.error) throw new Error(exceptions.error.message);
  return {
    rules: rules.data.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      weekday: r.weekday,
      startTime: hhmm(r.start_time),
      endTime: hhmm(r.end_time),
    })),
    exceptions: exceptions.data.map((e) => ({
      id: e.id,
      providerId: e.provider_id,
      date: e.date,
      startTime: e.start_time ? hhmm(e.start_time) : null,
      endTime: e.end_time ? hhmm(e.end_time) : null,
      reason: e.reason,
    })),
  };
}
