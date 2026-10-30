import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProviderAvatar } from "@/components/features/catalog/provider-avatar";
import { BookingFlow, BookingFlowSkeleton } from "@/components/features/booking/booking-flow";
import { getAllProviderSlugs, getProviderBySlug } from "@/lib/catalog/repository";

export const metadata: Metadata = {
  title: "Book a session",
  robots: { index: false },
};

export async function generateStaticParams() {
  return (await getAllProviderSlugs()).map(({ slug }) => ({ slug }));
}

// The page shell (provider and services) is prerendered; free times load in the browser for the
// visitor's own time zone (BookingFlow → /api/slots).
export default async function BookPage({ params }: PageProps<"/pros/[slug]/book">) {
  const { slug } = await params;
  const provider = await getProviderBySlug(slug);
  if (!provider) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link
        href={`/pros/${provider.slug}`}
        className="inline-flex min-h-6 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Back to {provider.displayName}
      </Link>
      <header className="mt-6 flex items-center gap-4">
        <ProviderAvatar name={provider.displayName} photoUrl={provider.photoUrl} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Book with {provider.displayName}
          </h1>
          <p className="text-muted-foreground">{provider.headline}</p>
        </div>
      </header>
      <div className="mt-10">
        {/* useSearchParams (restoring a selection after sign-in) needs a Suspense boundary. */}
        <Suspense fallback={<BookingFlowSkeleton />}>
          <BookingFlow
            provider={{
              id: provider.id,
              slug: provider.slug,
              name: provider.displayName,
              timezone: provider.timezone,
            }}
            services={provider.services.map((s) => ({
              id: s.id,
              title: s.title,
              description: s.description,
              durationMin: s.durationMin,
              priceCents: s.priceCents,
              currency: s.currency,
            }))}
          />
        </Suspense>
      </div>
    </div>
  );
}
