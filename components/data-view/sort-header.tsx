import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import Link from "next/link";

/**
 * A sortable column header. aria-sort tells screen readers the current order (only on the column
 * the table is sorted by); the link says what activating it will do ("Sort by date, oldest first").
 * Sorting lives in the URL, so it works without JavaScript and can be shared.
 */
export function SortHeader({
  label,
  direction,
  href,
  nextLabel,
  className,
  LinkComponent = Link,
}: {
  label: string;
  /** Undefined: the table is sorted by another column. */
  direction?: "ascending" | "descending";
  href: string;
  /** What a click does, e.g. "A to Z". Default: the opposite date order. */
  nextLabel?: string;
  className?: string;
  /** E.g. TableLink, to re-sort in place instead of a plain navigation. */
  LinkComponent?: React.ComponentType<React.ComponentProps<typeof Link> & { href: string }>;
}) {
  const Icon =
    direction === undefined
      ? ArrowUpDownIcon
      : direction === "ascending"
        ? ArrowUpIcon
        : ArrowDownIcon;
  const next = nextLabel ?? (direction === "ascending" ? "newest first" : "oldest first");
  return (
    <th scope="col" aria-sort={direction} className={className}>
      <LinkComponent
        href={href}
        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
      >
        {label}
        <Icon
          className={direction === undefined ? "size-3.5 opacity-40" : "size-3.5"}
          aria-hidden="true"
        />
        <span className="sr-only">, sort {next}</span>
      </LinkComponent>
    </th>
  );
}
