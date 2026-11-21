import type { ShelfGrouping, ShelfWatchState } from "@/lib/api";
import type { SortChoice } from "./labels";

/** The face a See all was opened from; `by=all` means New on Discover and All videos in Library. */
export type ShelfOrigin = "discover" | "library";

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

/** A See all destination; the Library's folder, tag, state and name conditions ride in the URL. */
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
  for (const folder of conditions.folder ?? []) query.append("folder", folder);
  if (conditions.fromFolder) query.set("from_folder", conditions.fromFolder);
  for (const tag of conditions.tag ?? []) query.append("tag", tag);
  if (conditions.watch) query.set("watch", conditions.watch);
  if (conditions.name) query.set("q", conditions.name);
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
