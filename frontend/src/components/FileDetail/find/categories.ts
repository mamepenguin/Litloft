import type { FindKind, FindRow } from "@/lib/fileFind";
import type { FindCategory } from "./types";

/** Chips are wider than kinds: a page, a section and a body are one 「本文」. */
export function categoryOf(kind: FindKind): Exclude<FindCategory, "all"> {
  switch (kind) {
    case "page":
    case "section":
    case "text":
      return "text";
    default:
      return kind;
  }
}

/** The order the chips appear in, 「すべて」 excluded. */
export const CATEGORY_ORDER: Exclude<FindCategory, "all">[] = [
  "utterance",
  "scene",
  "text",
  "picture_text",
];

export function presentCategories(rows: readonly FindRow[]): Exclude<FindCategory, "all">[] {
  const present = new Set(rows.map((row) => categoryOf(row.kind)));
  return CATEGORY_ORDER.filter((category) => present.has(category));
}

/** No strip at zero or one category: a filter over one answer says nothing. */
export function showsCategoryChips(rows: readonly FindRow[]): boolean {
  return presentCategories(rows).length >= 2;
}

export function rowsForCategory(
  rows: readonly FindRow[],
  category: FindCategory,
): FindRow[] {
  if (category === "all") return [...rows];
  return rows.filter((row) => categoryOf(row.kind) === category);
}
