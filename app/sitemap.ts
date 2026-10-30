import type { MetadataRoute } from "next";

import { getAllProviderSlugs } from "@/lib/catalog/repository";
import { absoluteUrl } from "@/lib/site";

// lastModified comes from data, not `new Date()`: Cache Components forbids the current time in
// prerendered output, and a stable date is more honest for crawlers anyway.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const providers = await getAllProviderSlugs();
  const latest = providers
    .map((p) => p.updatedAt)
    .sort()
    .at(-1);
  return [
    { url: absoluteUrl("/"), lastModified: latest, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/pros"), lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/pricing"), changeFrequency: "monthly", priority: 0.6 },
    ...providers.map((p) => ({
      url: absoluteUrl(`/pros/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
