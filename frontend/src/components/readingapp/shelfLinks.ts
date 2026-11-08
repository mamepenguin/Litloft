import type { ShelfGrouping, ShelfWatchState } from "@/lib/api";
import type { SortChoice } from "./labels";

export interface ShelfLinkConditions {
  folder?: readonly string[];
  tag?: readonly string[];
  watch?: ShelfWatchState;
}

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
): string {
  const query = new URLSearchParams({ by, key });
  if (sortId !== undefined && sortId !== "newest") query.set("sort", sortId);
  for (const folder of conditions.folder ?? []) query.append("folder", folder);
  for (const tag of conditions.tag ?? []) query.append("tag", tag);
  if (conditions.watch) query.set("watch", conditions.watch);
  return `/drive/${encodeURIComponent(drive)}/apps/reading/shelf?${query.toString()}`;
}
