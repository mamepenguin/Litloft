import type { SortField } from "@/types";

/**
 * Sort fields a folder can own.
 *
 * These are the ones ``SortButton`` can display and ``sortMerged`` knows
 * how to apply, so they are the only values a stored per-folder preference
 * may hold. ``liked_at`` is deliberately absent: the Liked view sets it on
 * its own fetch, and an ordinary folder adopting it — from a hand-edited
 * preference, say — would sort by a column most of its rows leave NULL,
 * with no way for the toolbar to show what is going on.
 */
const UI_SORT_FIELDS: readonly SortField[] = [
  "created_at",
  "title",
  "file_size",
  "random",
  "relevance",
];

/**
 * Everything the listing and neighbors endpoints accept: the fields a
 * folder can own, plus the Liked view's own key, which reaches those
 * endpoints through the URL rather than through a preference.
 */
const API_SORT_FIELDS: readonly SortField[] = [...UI_SORT_FIELDS, "liked_at"];

export function isSortField(value: unknown): value is SortField {
  return (
    typeof value === "string" && (UI_SORT_FIELDS as string[]).includes(value)
  );
}

/**
 * Drop a sort value the API no longer accepts.
 *
 * A sort selection outlives a deploy: it sits in ``folderPrefs`` per folder,
 * in the list snapshot, and in any URL that was shared or left open. When a
 * field is retired, an un-normalised value is replayed on every load and the
 * request 422s until the store is cleared by hand — so unknown values fall
 * back to the endpoint's own default rather than being forwarded.
 */
export function normalizeSortParam(
  value: string | null | undefined,
): string | undefined {
  return typeof value === "string" &&
    (API_SORT_FIELDS as string[]).includes(value)
    ? value
    : undefined;
}
