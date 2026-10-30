import { Faq } from "@/components/features/landing/faq";
import { Hero } from "@/components/features/landing/hero";
import {
  Categories,
  FeaturedProviders,
  FinalCta,
  HowItWorks,
  Testimonials,
} from "@/components/features/landing/sections";
import { getCatalogStats, getFeaturedProviders } from "@/lib/catalog/repository";

// Server Component: data comes from cached functions, so the whole page is prerendered as static HTML.
export default async function HomePage() {
  const [stats, featured] = await Promise.all([getCatalogStats(), getFeaturedProviders(3)]);
  return (
    <>
      <Hero providerCount={stats.providerCount} cityCount={stats.cities.length} />
      <HowItWorks />
      <Categories />
      <FeaturedProviders providers={featured} />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
