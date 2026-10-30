import { XIcon } from "lucide-react";
import Link from "next/link";

import { FORMAT_LABELS, catalogHref, type CatalogQuery } from "@/lib/catalog/query";
import { CATEGORY_LABELS } from "@/lib/catalog/types";

/** One removable chip per active filter. Each chip is a plain link to the URL without that filter. */
export function ActiveFilters({ query }: { query: CatalogQuery }) {
  const chips: { label: string; without: Partial<CatalogQuery> }[] = [];
  if (query.q) chips.push({ label: `“${query.q}”`, without: { q: undefined } });
  if (query.category)
    chips.push({ label: CATEGORY_LABELS[query.category], without: { category: undefined } });
  if (query.city) chips.push({ label: query.city, without: { city: undefined } });
  if (query.format)
    chips.push({ label: FORMAT_LABELS[query.format], without: { format: undefined } });
  if (query.minPrice !== undefined)
    chips.push({ label: `From $${query.minPrice}`, without: { minPrice: undefined } });
  if (query.maxPrice !== undefined)
    chips.push({ label: `Up to $${query.maxPrice}`, without: { maxPrice: undefined } });
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.label}>
          <Link
            href={catalogHref({ ...query, ...chip.without, page: 1 })}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="sr-only">Remove filter: </span>
            {chip.label}
            <XIcon className="size-3.5" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
