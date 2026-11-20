import type { ShelfGrouping } from "@/lib/api";
import { formatMonth } from "@/lib/formatMonth";

type Translate = (key: string) => string;

export const READING_GROUPS = ["tag", "folder", "month", "none"] as const;
export type ReadingGroup = (typeof READING_GROUPS)[number];

export const DEFAULT_READING_GROUP: ReadingGroup = "none";

export function isReadingGroup(value: string | null | undefined): value is ReadingGroup {
  return READING_GROUPS.some((group) => group === value);
}

export interface SortChoice {
  id: "newest" | "oldest" | "title" | "size";
  labelKey: string;
  sort: "created_at" | "title" | "file_size";
  order: "asc" | "desc";
}

export const SORT_CHOICES: readonly SortChoice[] = [
  { id: "newest", labelKey: "sort.addedNewest", sort: "created_at", order: "desc" },
  { id: "oldest", labelKey: "sort.addedOldest", sort: "created_at", order: "asc" },
  { id: "title", labelKey: "sort.title", sort: "title", order: "asc" },
  { id: "size", labelKey: "sort.size", sort: "file_size", order: "desc" },
];

export type SortId = SortChoice["id"];

export function isSortId(value: string | null | undefined): value is SortId {
  return SORT_CHOICES.some((choice) => choice.id === value);
}

export function parseSortId(raw: string | null): SortChoice["id"] | null {
  return SORT_CHOICES.find((choice) => choice.id === raw)?.id ?? null;
}

export type ShelfSortChoice =
  | SortChoice
  | { id: "played"; labelKey: string; sort: "last_played"; order: "desc" };

/** Offered by the Continue shelf page alone; other shelves and Library use the four above. */
export const CONTINUE_SORT_CHOICES: readonly ShelfSortChoice[] = [
  { id: "played", labelKey: "sort.lastOpened", sort: "last_played", order: "desc" },
  ...SORT_CHOICES,
];

export function parseShelfSortId(
  raw: string | null,
  choices: readonly ShelfSortChoice[],
): ShelfSortChoice["id"] | null {
  return choices.find((choice) => choice.id === raw)?.id ?? null;
}

export function sortChoiceOf(id: SortChoice["id"]): SortChoice {
  return SORT_CHOICES.find((choice) => choice.id === id) ?? SORT_CHOICES[0];
}

/** The last segment of a folder path; the drive name at the root. */
export function folderLabel(folderPath: string, drive: string): string {
  const path = folderPath.normalize("NFC").replace(/\/+$/, "");
  if (path === "") return drive;
  return path.split("/").pop() || drive;
}

export type BookFormat = "epub" | "pdf" | "archive";

export function bookFormat(item: { mime_type: string; filename: string }): BookFormat {
  const name = item.filename.toLowerCase();
  if (item.mime_type === "application/epub+zip" || name.endsWith(".epub")) return "epub";
  if (item.mime_type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "archive";
}

/**
 * Fixed shelves carry client text; a tag shelf is named by its tag, a folder
 * shelf by its last path segment, and a month shelf by its year and month.
 */
export function shelfTitle({
  by,
  key,
  drive,
  locale,
  from,
  t,
}: {
  by: ShelfGrouping;
  key: string;
  drive: string;
  locale: string;
  from?: string | null;
  t: Translate;
}): string {
  if (by === "all") return from === "discover" ? t("shelves.new") : t("allBooks");
  if (by === "folder") return folderLabel(key, drive);
  if (by === "tag") return key === "no_tag" ? t("noTag") : key;
  if (by === "month") return formatMonth(key, locale);
  if (by === "watch") return t(`shelves.${key}`);
  return key;
}
