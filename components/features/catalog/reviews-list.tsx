"use client";

import { useRef, useState, useSyncExternalStore } from "react";

import { ReviewItem } from "@/components/features/catalog/review-item";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/catalog/format";
import { REVIEWS_PAGE_SIZE, type ReviewsPage } from "@/lib/catalog/reviews";
import type { Review } from "@/lib/catalog/types";

const subscribeNoop = () => () => {};

/**
 * The newest reviews come with the page (server HTML, visible without JavaScript); "Show more
 * reviews" appends the next page in place. Focus moves to the first new review and a live region
 * says how many were added, so keyboard and screen reader users keep their place.
 */
export function ReviewsList({
  slug,
  initial,
  total: initialTotal,
}: {
  slug: string;
  initial: Review[];
  total: number;
}) {
  const [items, setItems] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");
  const firstNew = useRef<HTMLLIElement>(null);
  const [firstNewId, setFirstNewId] = useState<string | null>(null);
  // The button needs JavaScript; without it the page simply shows the newest reviews.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const remaining = Math.max(0, total - items.length);

  async function loadMore() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/pros/${slug}/reviews?offset=${items.length}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as ReviewsPage;
      // A review hidden or added since the page loaded can shift the pages: skip duplicates.
      const known = new Set(items.map((r) => r.id));
      const added = page.reviews.filter((r) => !known.has(r.id));
      setItems((prev) => [...prev, ...added]);
      // The server's count wins; an empty page means there is nothing more, whatever the count says.
      setTotal(page.reviews.length ? page.total : items.length + added.length);
      setFirstNewId(added[0]?.id ?? null);
      setAnnouncement(
        added.length ? `${pluralize(added.length, "more review", "more reviews")} loaded.` : "",
      );
      setStatus("idle");
      requestAnimationFrame(() => firstNew.current?.focus());
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <ul className="mt-4 space-y-4">
        {items.map((review) => (
          <li
            key={review.id}
            ref={review.id === firstNewId ? firstNew : undefined}
            tabIndex={review.id === firstNewId ? -1 : undefined}
            className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ReviewItem review={review} />
          </li>
        ))}
      </ul>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {mounted && remaining > 0 && (
        <div className="mt-4 flex flex-col items-start gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadMore()}
            disabled={status === "loading"}
            aria-describedby={status === "error" ? "reviews-error" : undefined}
          >
            {status === "loading"
              ? "Loading reviews…"
              : status === "error"
                ? "Try again"
                : remaining <= REVIEWS_PAGE_SIZE
                  ? `Show ${pluralize(remaining, "more review", "more reviews")}`
                  : `Show ${REVIEWS_PAGE_SIZE} more reviews (${remaining} left)`}
          </Button>
          {status === "error" && (
            <p id="reviews-error" className="text-sm text-destructive">
              We could not load more reviews. Check your connection and try again.
            </p>
          )}
        </div>
      )}
    </>
  );
}
