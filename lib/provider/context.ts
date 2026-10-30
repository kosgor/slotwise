import "server-only";

import { requireUser } from "@/lib/auth/guards";

import { getOwnProvider } from "./queries";

/** Signed-in user and their provider profile (null if they have none) for dashboard pages. */
export async function getProviderContext(next: string) {
  const user = await requireUser(next);
  const provider = await getOwnProvider(user.id);
  return { user, provider };
}

/** IANA zones known to this server, plus the provider's current one even if Node's list lacks it. */
export function timeZoneOptions(current?: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}
