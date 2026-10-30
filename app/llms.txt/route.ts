// llms.txt (https://llmstxt.org): a plain Markdown map of the site for language models.
// Generated from the same cached catalog data as the pages, so it never goes stale.

import { formatPrice, startingPrice } from "@/lib/catalog/format";
import { searchProviders } from "@/lib/catalog/repository";
import { CATEGORY_LABELS } from "@/lib/catalog/types";
import { FAQ_ITEMS } from "@/lib/content/faq";
import { PLANS } from "@/lib/content/plans";
import { absoluteUrl, site } from "@/lib/site";

export async function GET() {
  // Page size is 9, so walk all pages to list every provider.
  const first = await searchProviders({ sort: "recommended", page: 1 });
  const rest = await Promise.all(
    Array.from({ length: first.pageCount - 1 }, (_, i) =>
      searchProviders({ sort: "recommended", page: i + 2 }),
    ),
  );
  const providers = [first, ...rest].flatMap((p) => p.items);

  const body = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    "Slotwise is a booking platform where clients find independent professionals, see real availability and book sessions online or in person.",
    "",
    "## Main pages",
    "",
    `- [Find a professional](${absoluteUrl("/pros")}): catalog with filters by category, city, price and format. Filters are URL parameters, e.g. ${absoluteUrl("/pros?category=yoga&city=Manchester")}`,
    `- [Pricing for professionals](${absoluteUrl("/pricing")}): ${PLANS.map((p) => `${p.name} plan: ${p.priceCents.monthly ? `${formatPrice(p.priceCents.monthly)}/month` : "free"}`).join(", ")}`,
    "",
    "## Professionals",
    "",
    ...providers.map(
      (p) =>
        `- [${p.displayName}](${absoluteUrl(`/pros/${p.slug}`)}): ${CATEGORY_LABELS[p.category]}, ${p.city}. ${p.headline}. ${startingPrice(p)}.`,
    ),
    "",
    "## FAQ",
    "",
    ...FAQ_ITEMS.flatMap((f) => [`### ${f.question}`, "", f.answer, ""]),
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
