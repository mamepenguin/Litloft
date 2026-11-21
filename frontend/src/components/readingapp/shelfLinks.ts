import type { ShelfGrouping, ShelfWatchState } from "@/lib/api";
import type { SortChoice } from "./labels";

export interface ShelfLinkConditions {
  /** The position narrowed into the target's own folders. */
  folder?: readonly string[];
  /** The position the Library was at, so the shelf page's way back opens there. */
  fromFolder?: string;
  tag?: readonly string[];
  watch?: ShelfWatchState;
  /** The applied name filter, carried as `q`. */
  name?: string;
}

/** The face a See all was opened from; `by=all` means New on Discover and All books in Library. */
export type ShelfOrigin = "discover" | "library";

/**
 * A See all destination. The folder, tag and watch conditions in force ride
 * in the URL, so the shelf page runs the same request the face did.
 */
export function readingShelfHref(
  drive: string,
  by: ShelfGrouping,
  key: string,
  sortId?: SortChoice["id"],
  conditions: ShelfLinkConditions = {},
  from?: ShelfOrigin,
): string {
  const query = new URLSearchParams({ by, key });
  if (sortId !== undefined && sortId !== "newest") query.set("sort", sortId);
  for (const folder of conditions.folder ?? []) query.append("folder", folder);
  if (conditions.fromFolder) query.set("from_folder", conditions.fromFolder);
  for (const tag of conditions.tag ?? []) query.append("tag", tag);
  if (conditions.watch) query.set("watch", conditions.watch);
  if (conditions.name) query.set("q", conditions.name);
  if (from) query.set("from", from);
  return `/drive/${encodeURIComponent(drive)}/apps/reading/shelf?${query.toString()}`;
}
