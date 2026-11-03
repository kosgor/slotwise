// Where catalog data comes from: Supabase, as the anonymous role (createPublicClient).
// RLS returns only approved providers, active services and visible reviews — the same rules the
// seed-based version used to apply in TypeScript (see docs/decisions/0003).
// Caching is done one level up, in repository.ts.

import type { AvailabilityException, AvailabilityRule } from "@/lib/booking/types";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";

import { ratingBreakdown, REVIEWS_FIRST_PAGE, type ReviewsPage } from "./reviews";
import type { Category, ProviderDetails, ProviderSummary, Review, Service } from "./types";

type CatalogRow = Database["public"]["Views"]["catalog_providers"]["Row"];
type ServiceRow = Database["public"]["Tables"]["services"]["Row"];
type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

/** Columns of a view are nullable in generated types; the view itself guarantees them. */
function toSummary(row: CatalogRow): ProviderSummary {
  return {
    id: row.id!,
    slug: row.slug!,
    displayName: row.display_name!,
    headline: row.headline!,
    bio: row.bio ?? "",
    category: row.category! as Category,
    city: row.city!,
    timezone: row.timezone!,
    offersOnline: row.offers_online!,
    offersInPerson: row.offers_in_person!,
    yearsExperience: row.years_experience ?? 0,
    languages: row.languages ?? [],
    status: "approved",
    photoUrl: row.photo_url,
    updatedAt: row.updated_at!,
    minPriceCents: row.min_price_cents!,
    currency: row.currency!,
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    reviewCount: row.review_count ?? 0,
  };
}

const toService = (row: ServiceRow): Service => ({
  id: row.id,
  providerId: row.provider_id,
  title: row.title,
  description: row.description,
  durationMin: row.duration_min,
  priceCents: row.price_cents,
  currency: row.currency,
  active: row.active,
});

const toReview = (row: ReviewRow): Review => ({
  id: row.id,
  providerId: row.provider_id,
  authorName: row.author_name,
  rating: row.rating,
  body: row.body,
  createdAt: row.created_at,
  hidden: row.hidden,
});

/** "09:00:00" (Postgres time) -> "09:00" */
const hhmm = (time: string) => time.slice(0, 5);

export async function loadApprovedSummaries(): Promise<ProviderSummary[]> {
  const { data, error } = await createPublicClient().from("catalog_providers").select("*");
  if (error) throw new Error(`Failed to load catalog: ${error.message}`);
  return data.map(toSummary);
}

export async function loadProviderDetails(slug: string): Promise<ProviderDetails | null> {
  const supabase = createPublicClient();
  const { data: row, error } = await supabase
    .from("catalog_providers")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Failed to load provider: ${error.message}`);
  if (!row) return null;

  const [servicesResult, firstReviews, ratingsResult] = await Promise.all([
    supabase.from("services").select("*").eq("provider_id", row.id!).order("price_cents"),
    loadReviewsPage(row.id!, 0, REVIEWS_FIRST_PAGE),
    // Only the ratings of every review, for the breakdown: small even for hundreds of reviews.
    supabase.from("reviews").select("rating").eq("provider_id", row.id!),
  ]);
  if (servicesResult.error) throw new Error(servicesResult.error.message);
  if (ratingsResult.error) throw new Error(ratingsResult.error.message);

  return {
    ...toSummary(row),
    services: servicesResult.data.map(toService),
    reviews: firstReviews.reviews,
    ratingBreakdown: ratingBreakdown(ratingsResult.data.map((r) => r.rating)),
  };
}

/** One page of a provider's visible reviews, newest first (RLS hides moderated ones). */
export async function loadReviewsPage(
  providerId: string,
  offset: number,
  limit: number,
): Promise<ReviewsPage> {
  const { data, count, error } = await createPublicClient()
    .from("reviews")
    .select("*", { count: "exact" })
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + limit - 1);
  // An offset past the end is not an error for a "load more" list: just nothing more.
  if (error?.code === "PGRST103") return { reviews: [], total: count ?? 0 };
  if (error) throw new Error(`Failed to load reviews: ${error.message}`);
  return { reviews: data.map(toReview), total: count ?? 0 };
}

export async function loadSchedule(
  providerId: string,
): Promise<{ rules: AvailabilityRule[]; exceptions: AvailabilityException[] }> {
  const supabase = createPublicClient();
  const [rules, exceptions] = await Promise.all([
    supabase.from("availability_rules").select("*").eq("provider_id", providerId),
    supabase.from("availability_exceptions").select("*").eq("provider_id", providerId),
  ]);
  if (rules.error) throw new Error(rules.error.message);
  if (exceptions.error) throw new Error(exceptions.error.message);
  return {
    rules: rules.data.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      weekday: r.weekday,
      startTime: hhmm(r.start_time),
      endTime: hhmm(r.end_time),
    })),
    exceptions: exceptions.data.map((e) => ({
      id: e.id,
      providerId: e.provider_id,
      date: e.date,
      startTime: e.start_time ? hhmm(e.start_time) : null,
      endTime: e.end_time ? hhmm(e.end_time) : null,
      reason: e.reason,
    })),
  };
}
