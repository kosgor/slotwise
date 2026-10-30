import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { FORMATS, FORMAT_LABELS, type CatalogQuery } from "@/lib/catalog/query";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/catalog/types";

export const FILTERS_FORM_ID = "catalog-filters";

/**
 * Plain GET form: submitting it navigates to /pros?category=...&city=...
 * Native selects work without JavaScript, open the OS picker on phones and need no ARIA.
 * `page` is not a field, so applying filters always returns to page 1.
 */
export function CatalogFilters({
  query,
  cities,
  idPrefix,
  formId,
}: {
  query: CatalogQuery;
  cities: string[];
  idPrefix: string;
  /** Only the desktop form gets the id that the sort select points to. */
  formId?: string;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <Form action="/pros" id={formId} className="space-y-5" aria-label="Filters">
      <div className="space-y-2">
        <Label htmlFor={id("q")}>Search</Label>
        <Input
          id={id("q")}
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Name, skill or city"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={id("category")}>Category</Label>
        <NativeSelect
          id={id("category")}
          name="category"
          defaultValue={query.category ?? ""}
          className="w-full"
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {CATEGORIES.map((c) => (
            <NativeSelectOption key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor={id("city")}>City</Label>
        <NativeSelect
          id={id("city")}
          name="city"
          defaultValue={query.city ?? ""}
          className="w-full"
        >
          <NativeSelectOption value="">All cities</NativeSelectOption>
          {cities.map((city) => (
            <NativeSelectOption key={city} value={city}>
              {city}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor={id("format")}>Format</Label>
        <NativeSelect
          id={id("format")}
          name="format"
          defaultValue={query.format ?? ""}
          className="w-full"
        >
          <NativeSelectOption value="">Online or in person</NativeSelectOption>
          {FORMATS.map((f) => (
            <NativeSelectOption key={f} value={f}>
              {FORMAT_LABELS[f]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Starting price, £</legend>
        <div className="flex items-center gap-2">
          <Label htmlFor={id("min")} className="sr-only">
            Minimum price
          </Label>
          <Input
            id={id("min")}
            name="minPrice"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            defaultValue={query.minPrice}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <Label htmlFor={id("max")} className="sr-only">
            Maximum price
          </Label>
          <Input
            id={id("max")}
            name="maxPrice"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            defaultValue={query.maxPrice}
          />
        </div>
      </fieldset>

      {/* Keep the chosen sort when filters change. The desktop form gets the sort value from
          SortSelect (linked via the form attribute); a hidden duplicate would override it. */}
      {!formId && query.sort !== "recommended" && (
        <input type="hidden" name="sort" value={query.sort} />
      )}

      <div className="flex gap-2">
        <Button type="submit" className="h-10 flex-1">
          Apply filters
        </Button>
        <Button asChild variant="ghost" className="h-10">
          <Link href="/pros">Reset</Link>
        </Button>
      </div>
    </Form>
  );
}
