// Domain types for the public catalog. Field names mirror supabase/migrations (camelCase here,
// snake_case in SQL); the repository maps between them.

export const CATEGORIES = ["tutoring", "fitness", "yoga", "coaching", "massage", "music"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tutoring: "Tutoring",
  fitness: "Fitness",
  yoga: "Yoga & Pilates",
  coaching: "Coaching",
  massage: "Massage",
  music: "Music lessons",
};

export type ProviderStatus = "pending" | "approved" | "rejected" | "suspended" | "removed";

export type Provider = {
  id: string;
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  category: Category;
  city: string;
  timezone: string;
  offersOnline: boolean;
  offersInPerson: boolean;
  yearsExperience: number;
  languages: string[];
  status: ProviderStatus;
  /** Path under /public today; a Supabase Storage URL once uploads exist. Null = initials avatar. */
  photoUrl: string | null;
  updatedAt: string;
};

export type Service = {
  id: string;
  providerId: string;
  title: string;
  description: string;
  durationMin: number;
  priceCents: number;
  currency: string;
  active: boolean;
};

export type Review = {
  id: string;
  providerId: string;
  authorName: string;
  rating: number;
  body: string;
  createdAt: string;
  hidden: boolean;
};

/** A provider as shown in catalog cards: aggregates computed from services and reviews. */
export type ProviderSummary = Provider & {
  minPriceCents: number;
  currency: string;
  ratingAvg: number | null;
  reviewCount: number;
};

export type ProviderDetails = ProviderSummary & {
  services: Service[];
  reviews: Review[];
};
