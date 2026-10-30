import { StarIcon } from "lucide-react";

import { pluralize } from "@/lib/catalog/format";
import { cn } from "@/lib/utils";

export function Rating({
  value,
  count,
  className,
}: {
  value: number | null;
  count: number;
  className?: string;
}) {
  if (value === null) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No reviews yet</p>;
  }
  return (
    <p className={cn("flex items-center gap-1 text-sm", className)}>
      <StarIcon className="size-4 fill-warning text-warning" aria-hidden="true" />
      {/* The visible text carries the meaning; the star is decoration. */}
      <span className="font-medium">{value.toFixed(1)}</span>
      <span className="text-muted-foreground">({pluralize(count, "review", "reviews")})</span>
    </p>
  );
}
