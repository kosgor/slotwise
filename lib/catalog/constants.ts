// Catalog constants without dependencies. Client Components import from here, not from
// query.ts: query.ts pulls in zod, which would add ~30 KB to the browser bundle for nothing.

export const PAGE_SIZE = 9;

export const SORT_OPTIONS = ["recommended", "price_asc", "price_desc", "rating"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<SortOption, string> = {
  recommended: "Recommended",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Highest rated",
};

export const FORMATS = ["online", "in_person"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<Format, string> = {
  online: "Online",
  in_person: "In person",
};
