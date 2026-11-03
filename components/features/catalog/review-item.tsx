import type { Review } from "@/lib/catalog/types";

const reviewDate = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** One review card. No hooks: rendered by the page and by the client "Show more" list alike. */
export function ReviewItem({ review }: { review: Review }) {
  return (
    <figure className="rounded-xl border bg-card p-5">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">{review.authorName}</span>
        <span className="text-muted-foreground">
          <span className="sr-only">Rating: </span>
          {review.rating} out of 5 · {reviewDate.format(new Date(review.createdAt))}
        </span>
      </figcaption>
      <blockquote className="mt-2">{review.body}</blockquote>
    </figure>
  );
}
