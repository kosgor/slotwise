import type { ProviderSummary } from "./types";

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats integer minor units as a price without decimals: 4500 -> "£45". */
export function formatPrice(cents: number, currency = "GBP"): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatsLabel(p: Pick<ProviderSummary, "offersOnline" | "offersInPerson">) {
  if (p.offersOnline && p.offersInPerson) return "Online and in person";
  return p.offersOnline ? "Online" : "In person";
}

export function startingPrice(p: Pick<ProviderSummary, "minPriceCents" | "currency">) {
  return p.minPriceCents === 0 ? "Free intro" : `From ${formatPrice(p.minPriceCents, p.currency)}`;
}
