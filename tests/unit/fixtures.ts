// Seed-based data for unit tests: the same shapes the Supabase source returns, without network.
import { summarizeProviders } from "@/lib/catalog/query";
import { providers, reviews, services } from "@/lib/catalog/seed-data";
import type { ProviderDetails, ProviderSummary } from "@/lib/catalog/types";

export const seedSummaries = (): ProviderSummary[] =>
  summarizeProviders(providers, services, reviews);

export function seedDetails(slug: string): ProviderDetails | null {
  const summary = seedSummaries().find((p) => p.slug === slug);
  if (!summary) return null;
  return {
    ...summary,
    services: services.filter((s) => s.providerId === summary.id && s.active),
    reviews: reviews.filter((r) => r.providerId === summary.id && !r.hidden),
  };
}
