// Structured data (schema.org JSON-LD) for search engines and AI crawlers.

import { CATEGORY_LABELS, type ProviderDetails } from "@/lib/catalog/types";
import { absoluteUrl, site } from "@/lib/site";

type JsonLd = Record<string, unknown>;

/**
 * Serializes JSON-LD for a <script> tag. JSON.stringify alone is not safe: a provider bio
 * containing "</script>" would close the tag and inject HTML. Escaping "<" prevents that.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: site.name,
    url: site.url,
    email: site.email,
    description: site.description,
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    publisher: { "@id": absoluteUrl("/#organization") },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: absoluteUrl("/pros?q={search_term_string}") },
      "query-input": "required name=search_term_string",
    },
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function providerJsonLd(provider: ProviderDetails): JsonLd {
  const url = absoluteUrl(`/pros/${provider.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${url}#person`,
    name: provider.displayName,
    description: provider.bio,
    jobTitle: provider.headline,
    url,
    image: provider.photoUrl ? absoluteUrl(provider.photoUrl) : undefined,
    knowsLanguage: provider.languages,
    address: { "@type": "PostalAddress", addressLocality: provider.city },
    makesOffer: provider.services.map((service) => ({
      "@type": "Offer",
      price: (service.priceCents / 100).toFixed(2),
      priceCurrency: service.currency,
      itemOffered: {
        "@type": "Service",
        name: service.title,
        description: service.description,
        serviceType: CATEGORY_LABELS[provider.category],
        provider: { "@id": `${url}#person` },
        areaServed: provider.offersInPerson ? provider.city : undefined,
      },
    })),
  };
}
