import { MapPinIcon, MonitorIcon } from "lucide-react";
import Link from "next/link";

import { ProviderAvatar } from "@/components/features/catalog/provider-avatar";
import { Rating } from "@/components/features/catalog/rating";
import { Badge } from "@/components/ui/badge";
import { formatsLabel, startingPrice } from "@/lib/catalog/format";
import { CATEGORY_LABELS, type ProviderSummary } from "@/lib/catalog/types";

/**
 * The whole card is clickable through a stretched link (::after on the name link),
 * so screen readers hear one link with the provider's name, not a wall of text.
 */
export function ProviderCard({
  provider,
  headingLevel = "h3",
}: {
  provider: ProviderSummary;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <article className="group relative flex h-full flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md motion-safe:transition-transform motion-safe:hover:-translate-y-0.5">
      <div className="flex items-start gap-4">
        <ProviderAvatar name={provider.displayName} photoUrl={provider.photoUrl} />
        <div className="min-w-0 flex-1">
          <Heading className="text-base font-semibold">
            <Link
              href={`/pros/${provider.slug}`}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {provider.displayName}
            </Link>
          </Heading>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{provider.headline}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{CATEGORY_LABELS[provider.category]}</Badge>
      </div>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <MapPinIcon className="size-4" aria-hidden="true" />
          {provider.city}
        </li>
        <li className="flex items-center gap-2">
          <MonitorIcon className="size-4" aria-hidden="true" />
          {formatsLabel(provider)}
        </li>
      </ul>
      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
        <Rating value={provider.ratingAvg} count={provider.reviewCount} />
        <p className="text-sm font-semibold">{startingPrice(provider)}</p>
      </div>
    </article>
  );
}
