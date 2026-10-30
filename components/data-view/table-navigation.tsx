"use client";

// Client side of the data lists (admin tables, the provider bookings): search as you type, filters,
// sorting and pages update the URL inside a transition, so the list swaps its rows in place — no
// reload, no jump to the top, no empty moment (the old rows stay, dimmed, until the new ones
// arrive). Every control is still a link or a GET form underneath, so it works without JavaScript.

import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Navigate = (href: string, options?: { replace?: boolean }) => void;

const TableNavigation = createContext<{ pending: boolean; navigate: Navigate } | null>(null);

function useTableNavigation() {
  const value = use(TableNavigation);
  if (!value) throw new Error("Wrap the table in <TableNavigationProvider>");
  return value;
}

export function TableNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate: Navigate = (href, { replace = false } = {}) =>
    startTransition(() =>
      replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false }),
    );
  return <TableNavigation value={{ pending, navigate }}>{children}</TableNavigation>;
}

/** A link that updates the table in place. Ctrl/⌘-click and middle-click still open a new tab. */
export function TableLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  const { navigate } = useTableNavigation();
  return (
    <Link
      href={href}
      scroll={false}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        navigate(href);
      }}
      {...props}
    />
  );
}

const SEARCH_DELAY_MS = 300;

/**
 * Search by name as you type (after a short pause), right away on Enter, and back to all rows the
 * moment the field is emptied (✕, Escape or deleting the text). A new term starts at page 1 and
 * keeps the filter and sort, passed in as `hidden`.
 */
export function TableSearch({
  q,
  action,
  hidden,
  label = "Search by name",
}: {
  q: string;
  /** The page URL without search params, for the no-JavaScript GET form. */
  action: string;
  /** The other table params, carried by the no-JavaScript form and by every search. */
  hidden: [name: string, value: string][];
  label?: string;
}) {
  const { navigate } = useTableNavigation();
  const [value, setValue] = useState(q);
  const sent = useRef(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();

  // The URL changed from elsewhere (a stat tile, the back button): show its term.
  useEffect(() => {
    if (q !== sent.current) {
      sent.current = q;
      setValue(q);
    }
  }, [q]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(term: string, { now = false } = {}) {
    clearTimeout(timer.current);
    const trimmed = term.trim();
    const go = () => {
      if (trimmed === sent.current) return;
      sent.current = trimmed;
      const params = new URLSearchParams(hidden);
      if (trimmed) params.set("q", trimmed);
      const search = params.toString();
      // Typing replaces the history entry: Back leaves the search, not one letter.
      navigate(search ? `${action}?${search}` : action, { replace: true });
    };
    // An emptied field shows everything at once; a typed term waits for a pause.
    if (now || trimmed === "") go();
    else timer.current = setTimeout(go, SEARCH_DELAY_MS);
  }

  return (
    <form
      action={action}
      role="search"
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        search(value, { now: true });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={id}
            name="q"
            type="search"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              search(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && value) {
                event.preventDefault();
                setValue("");
                search("");
              }
            }}
            maxLength={100}
            autoComplete="off"
            // The browser's own clear button is replaced by ours (same look in every browser).
            className="w-64 max-w-full pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="absolute top-1/2 right-1 -translate-y-1/2">
            {value && (
              <button
                type="button"
                onClick={() => {
                  setValue("");
                  search("");
                }}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" aria-hidden="true" />
                <span className="sr-only">Clear search</span>
              </button>
            )}
          </span>
        </div>
      </div>
      {hidden.map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}

/**
 * The table's box: a fixed height with its own scroll, so the page never changes height when the
 * number of rows does. While new rows load it is aria-busy, the old rows dim and a spinner sits in
 * the middle of the visible box (after a short delay, so fast answers do not flash it). Back to the
 * top for each new view.
 * `relative` matters: without it the absolutely positioned sr-only labels in the rows belong to the
 * page, escape the scroll box and stretch the document to the full height of all rows.
 */
export function TableViewport({
  children,
  view,
  label,
  fit = false,
}: {
  children: React.ReactNode;
  /** Changes whenever the rows do (the table URL): scrolls the box back to the first row. */
  view: string;
  label: string;
  /** Fill the rest of a TABLE_PAGE_FIT page (table-layout.ts) on wide screens instead of the fixed height. */
  fit?: boolean;
}) {
  const { pending } = useTableNavigation();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: 0 });
  }, [view]);
  return (
    // The spinner is outside the scroll box, so it stays centred however far the rows are scrolled.
    <div className={cn("relative", fit && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col")}>
      <div
        ref={box}
        role="region"
        aria-label={label}
        aria-busy={pending || undefined}
        tabIndex={0}
        className={cn(
          "relative h-[min(34rem,65vh)] overflow-auto rounded-xl border transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          // A floor for short windows: below it the page scrolls rather than squeezing the rows.
          fit && "lg:h-auto lg:min-h-64 lg:flex-1",
          pending && "opacity-60",
        )}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity",
          pending ? "opacity-100 delay-150" : "opacity-0",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full border bg-popover shadow-sm">
          <Loader2Icon className="size-6 animate-spin text-primary motion-reduce:animate-none" />
        </span>
      </div>
    </div>
  );
}
