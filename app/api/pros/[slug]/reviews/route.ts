// GET /api/pros/[slug]/reviews?offset=5
// The next page of a public profile's reviews for "Show more reviews". Public data, read through the
// cached catalog (tag "catalog"), so hiding a review in the admin removes it here too.

import { NextResponse } from "next/server";

import { getProviderReviews } from "@/lib/catalog/repository";
import { parseReviewsOffset } from "@/lib/catalog/reviews";

export async function GET(request: Request, { params }: RouteContext<"/api/pros/[slug]/reviews">) {
  const { slug } = await params;
  const offset = parseReviewsOffset(new URL(request.url).searchParams.get("offset"));
  if (offset === null) return NextResponse.json({ error: "invalid_offset" }, { status: 400 });

  const page = await getProviderReviews(slug, offset);
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // No CDN cache on top: a review an admin hides must disappear at once, not after a TTL.
  return NextResponse.json(page);
}
