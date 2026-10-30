"use client";

import { ChevronDownIcon } from "lucide-react";
import { Accordion } from "radix-ui";
import { useEffect, useState } from "react";

/**
 * A dashboard section that can be folded away: the heading is the toggle (a real <h2> with a button
 * inside, aria-expanded/aria-controls from Radix) and `summary` keeps the key number visible while
 * it is closed. Closed content mounts on first open. With an `id`, a link to `#id` anywhere on the
 * page (the stat tiles) opens the section first, so it never leads to a folded heading.
 */
export function CollapsibleSection({
  id,
  title,
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  id?: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState(defaultOpen ? "open" : "");

  useEffect(() => {
    if (!id) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (link?.getAttribute("href")?.endsWith(`#${id}`)) setValue("open");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [id]);

  return (
    <Accordion.Root type="single" collapsible value={value} onValueChange={setValue} asChild>
      <section id={id} className={className}>
        <Accordion.Item value="open">
          <Accordion.Header asChild>
            <h2>
              <Accordion.Trigger className="group flex w-full items-center gap-3 rounded-lg py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="text-xl font-semibold">{title}</span>
                {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
                <ChevronDownIcon
                  className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Accordion.Trigger>
            </h2>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="space-y-4 pt-4">{children}</div>
          </Accordion.Content>
        </Accordion.Item>
      </section>
    </Accordion.Root>
  );
}
