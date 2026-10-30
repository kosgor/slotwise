import { ChevronDownIcon } from "lucide-react";

import { JsonLd } from "@/components/seo/json-ld";
import { FAQ_ITEMS } from "@/lib/content/faq";
import { faqJsonLd } from "@/lib/seo/json-ld";

/**
 * Native <details>: keyboard and screen reader support for free, works without JavaScript,
 * and answers stay in the HTML for search engines and AI crawlers (unlike a JS accordion
 * that unmounts closed panels).
 */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 py-20">
        <h2 id="faq-title" className="text-3xl font-semibold tracking-tight">
          Frequently asked questions
        </h2>
        <div className="mt-8 divide-y rounded-xl border bg-card">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDownIcon
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="pb-5 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={faqJsonLd([...FAQ_ITEMS])} />
    </section>
  );
}
