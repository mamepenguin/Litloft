import type { SortField, SortOrder } from "@/types";

export interface SortOption {
  labelKey: string;
  sort: SortField;
  order: SortOrder;
}

const RELEVANCE_OPTION: SortOption = {
  labelKey: "relevance",
  sort: "relevance",
  order: "desc",
};

const BASE_SORT_OPTIONS: SortOption[] = [
  { labelKey: "newestFirst", sort: "created_at", order: "desc" },
  { labelKey: "oldestFirst", sort: "created_at", order: "asc" },
  { labelKey: "titleAZ", sort: "title", order: "asc" },
  { labelKey: "titleZA", sort: "title", order: "desc" },
  { labelKey: "sizeLargest", sort: "file_size", order: "desc" },
  { labelKey: "sizeSmallest", sort: "file_size", order: "asc" },
  { labelKey: "random", sort: "random", order: "desc" },
];

/**
 * The orders a listing offers, in one place.
 *
 * `SortButton` held this table and `SortMenu` needs the same one. A second
 * copy would not fail anywhere: both menus would keep working, offering
 * different orders on different screens, and the only symptom would be a
 * folder that can be sorted by something Trash cannot.
 *
 * `relevance` is opt-in because it is meaningless outside a search query —
 * the caller says whether there is one.
 */
export function sortOptionsFor(allowRelevance?: boolean): SortOption[] {
  return allowRelevance
    ? [RELEVANCE_OPTION, ...BASE_SORT_OPTIONS]
    : BASE_SORT_OPTIONS;
}

/**
 * Is this order the one the screen starts in?
 *
 * Relevance is the search-mode default, so it counts as untouched there and
 * as a deliberate choice everywhere else. Callers use it to decide whether
 * the control should name the order it is holding or just name itself.
 */
export function isDefaultSort(
  sort: SortField,
  order: SortOrder,
  allowRelevance?: boolean,
): boolean {
  return allowRelevance
    ? sort === "relevance" && order === "desc"
    : sort === "created_at" && order === "desc";
}
