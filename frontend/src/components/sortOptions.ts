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
 * `relevance` is opt-in because it is meaningless outside a search query —
 * the caller says whether there is one.
 */
export function sortOptionsFor(allowRelevance?: boolean): SortOption[] {
  return allowRelevance
    ? [RELEVANCE_OPTION, ...BASE_SORT_OPTIONS]
    : BASE_SORT_OPTIONS;
}

export function isDefaultSort(
  sort: SortField,
  order: SortOrder,
  allowRelevance?: boolean,
): boolean {
  return allowRelevance
    ? sort === "relevance" && order === "desc"
    : sort === "created_at" && order === "desc";
}
