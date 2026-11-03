import { ArrowLeftIcon, ClockIcon, GlobeIcon, MapPinIcon, MonitorIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProviderAvatar } from "@/components/features/catalog/provider-avatar";
import { Rating } from "@/components/features/catalog/rating";
import { RatingBreakdown } from "@/components/features/catalog/rating-breakdown";
import { ReviewsList } from "@/components/features/catalog/reviews-list";
import { ProviderChat } from "@/components/features/chat/chat-launcher";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration, formatPrice, formatsLabel, startingPrice } from "@/lib/catalog/format";
import { catalogHref } from "@/lib/catalog/query";
import { getAllProviderSlugs, getProviderBySlug } from "@/lib/catalog/repository";
import { CATEGORY_LABELS } from "@/lib/catalog/types";
import { providerJsonLd } from "@/lib/seo/json-ld";

// Prerender every known profile at build time. New slugs still render on demand.
export async function generateStaticParams() {
  const slugs = await getAllProviderSlugs();
  return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/pros/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const provider = await getProviderBySlug(slug);
  if (!provider) return { title: "Professional not found" };
  const title = `${provider.displayName} — ${CATEGORY_LABELS[provider.category]} in ${provider.city}`;
  return {
    title,
    description: `${provider.headline}. ${startingPrice(provider)} per session. Book online with Slotwise.`,
    alternates: { canonical: `/pros/${provider.slug}` },
    openGraph: { title, description: provider.headline, type: "profile" },
  };
}

export default async function ProviderPage({ params }: PageProps<"/pros/[slug]">) {
  const { slug } = await params;
  const provider = await getProviderBySlug(slug);
  // Unknown and non-approved providers look the same from outside: 404, no hint that the profile exists.
  if (!provider) notFound();

  const bookHref = `/pros/${provider.slug}/book`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <JsonLd data={providerJsonLd(provider)} />
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link
              href="/pros"
              className="inline-flex min-h-6 items-center gap-1 hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" aria-hidden="true" />
              All professionals
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={catalogHref({ category: provider.category })}
              className="hover:text-foreground"
            >
              {CATEGORY_LABELS[provider.category]}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {provider.displayName}
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <ProviderAvatar
              name={provider.displayName}
              photoUrl={provider.photoUrl}
              size="lg"
              alt={`Portrait of ${provider.displayName}`}
              preload
            />
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">{provider.displayName}</h1>
              <p className="text-lg text-muted-foreground">{provider.headline}</p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Badge variant="secondary">{CATEGORY_LABELS[provider.category]}</Badge>
                <Rating value={provider.ratingAvg} count={provider.reviewCount} />
              </div>
            </div>
          </header>

          <section aria-labelledby="about-title">
            <h2 id="about-title" className="text-xl font-semibold">
              About
            </h2>
            <p className="mt-3 max-w-prose text-pretty">{provider.bio}</p>
            {/* <dl> may contain only <dt>/<dd> groups (optionally wrapped in one <div>), so icons go inside <dt>. */}
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { icon: MapPinIcon, term: "Location", value: provider.city },
                { icon: MonitorIcon, term: "Sessions", value: formatsLabel(provider) },
                { icon: GlobeIcon, term: "Languages", value: provider.languages.join(", ") },
              ].map(({ icon: Icon, term, value }) => (
                <div key={term}>
                  <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                    {term}
                  </dt>
                  <dd className="mt-1 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="services-title">
            <h2 id="services-title" className="text-xl font-semibold">
              Services and prices
            </h2>
            <ul className="mt-4 divide-y rounded-xl border bg-card">
              {provider.services.map((service) => (
                <li
                  key={service.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <h3 className="font-medium">{service.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ClockIcon className="size-4" aria-hidden="true" />
                      {formatDuration(service.durationMin)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
                    <p className="text-lg font-semibold">
                      {service.priceCents === 0
                        ? "Free"
                        : formatPrice(service.priceCents, service.currency)}
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`${bookHref}?service=${service.id}`}>
                        Book<span className="sr-only">: {service.title}</span>
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="reviews-title">
            <h2 id="reviews-title" className="text-xl font-semibold">
              Reviews
            </h2>
            {provider.reviews.length === 0 || provider.ratingAvg === null ? (
              <p className="mt-3 text-muted-foreground">No reviews yet.</p>
            ) : (
              <>
                <RatingBreakdown
                  average={provider.ratingAvg}
                  total={provider.reviewCount}
                  counts={provider.ratingBreakdown}
                />
                <ReviewsList
                  slug={provider.slug}
                  initial={provider.reviews}
                  total={provider.reviewCount}
                />
              </>
            )}
          </section>

          <ProviderChat slug={provider.slug} name={provider.displayName} />
        </div>

        <aside aria-labelledby="booking-title" className="lg:pt-2">
          <div className="sticky top-24 rounded-xl border bg-card p-6 shadow-sm">
            <h2 id="booking-title" className="text-lg font-semibold">
              Book a session
            </h2>
            <p className="mt-1 text-2xl font-semibold">{startingPrice(provider)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Times are shown in your time zone. Free cancellation up to 24 hours before.
            </p>
            <Button asChild size="lg" className="mt-5 h-11 w-full">
              <Link href={bookHref}>Book now</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
