import type { ShelfGrouping } from "@/lib/api";
import type { SortChoice } from "./labels";

/** The face a See all was opened from; `by=all` means New on Discover and All videos in Library. */
export type ShelfOrigin = "discover" | "library";

export function videoShelfHref(
  drive: string,
  by: ShelfGrouping,
  key: string,
  sortId?: SortChoice["id"],
  from?: ShelfOrigin,
): string {
  const query = new URLSearchParams({ by, key });
  if (sortId !== undefined && sortId !== "newest") query.set("sort", sortId);
  if (from) query.set("from", from);
  return `/drive/${encodeURIComponent(drive)}/apps/video/shelf?${query.toString()}`;
}

export function providerShelfHref(drive: string, entryId: string): string {
  return `/drive/${encodeURIComponent(drive)}/apps/video/shelf?entry=${encodeURIComponent(entryId)}`;
}
