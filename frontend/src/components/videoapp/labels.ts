import type { ShelfGrouping, Shelf } from "@/lib/api";

type Translate = (key: string) => string;

/**
 * Fixed shelves and the shelves the server leaves unlabelled get their text
 * from the client; folder, tag and month shelves carry their own data value.
 */
export function shelfTitle({
  by,
  shelf,
  drive,
  locale,
  from,
  t,
}: {
  by: ShelfGrouping;
  shelf: Pick<Shelf, "key" | "label">;
  drive: string;
  locale: string;
  from?: string | null;
  t: Translate;
}): string {
  if (by === "all") return from === "discover" ? t("shelves.new") : t("allVideos");
  if (by === "folder") {
    if (shelf.key === "") return drive;
    const path = shelf.key.endsWith("/") ? shelf.key.slice(0, -1) : shelf.key;
    return path.split("/").pop() || shelf.label;
  }
  if (by === "tag") return shelf.key === "no_tag" ? t("noTag") : shelf.label;
  if (by === "month") return formatMonth(shelf.label || shelf.key, locale);
  if (by === "duration") return t(`length.${shelf.key}`);
  if (by === "watch" && shelf.key === "continue") return t("shelves.continue");
  return t(`watch.${shelf.key}`);
}

function formatMonth(yearMonth: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return yearMonth;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
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
