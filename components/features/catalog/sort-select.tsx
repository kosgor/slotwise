"use client";

import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SORT_LABELS, SORT_OPTIONS, type SortOption } from "@/lib/catalog/constants";

/**
 * Lives outside the filters form but belongs to it via the `form` attribute, so sorting keeps
 * all filters. Changing the value re-submits the form; the result list updates in place and
 * focus stays on the select (no change of context, WCAG 3.2.2).
 */
export function SortSelect({ value, formId }: { value: SortOption; formId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="catalog-sort" className="text-sm whitespace-nowrap text-muted-foreground">
        Sort by
      </Label>
      <NativeSelect
        id="catalog-sort"
        name="sort"
        form={formId}
        defaultValue={value}
        data-default="recommended"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {SORT_OPTIONS.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {SORT_LABELS[option]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
