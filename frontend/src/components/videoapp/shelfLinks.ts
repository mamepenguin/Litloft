import type { ShelfGrouping, ShelfWatchState } from "@/lib/api";
import type { SortChoice } from "./labels";

/** The face a See all was opened from; `by=all` means New on Discover and All videos in Library. */
export type ShelfOrigin = "discover" | "library";

export interface ShelfLinkConditions {
  tag?: readonly string[];
  watch?: ShelfWatchState;
}

/** A See all destination; the Library's tag and state conditions ride in the URL. */
export function videoShelfHref(
  drive: string,
  by: ShelfGrouping,
  key: string,
  sortId?: SortChoice["id"],
  from?: ShelfOrigin,
  conditions: ShelfLinkConditions = {},
): string {
  const query = new URLSearchParams({ by, key });
  if (sortId !== undefined && sortId !== "newest") query.set("sort", sortId);
  for (const tag of conditions.tag ?? []) query.append("tag", tag);
  if (conditions.watch) query.set("watch", conditions.watch);
  if (from) query.set("from", from);
  return `/drive/${encodeURIComponent(drive)}/apps/video/shelf?${query.toString()}`;
}

export function providerShelfHref(
  drive: string,
  entryId: string,
  slot?: "recommended",
): string {
  const query = `entry=${encodeURIComponent(entryId)}${slot ? `&slot=${slot}` : ""}`;
  return `/drive/${encodeURIComponent(drive)}/apps/video/shelf?${query}`;
}
