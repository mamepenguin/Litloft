import type { ShelfGrouping } from "@/lib/api";
import type { SortChoice } from "./labels";

export function videoShelfHref(
  drive: string,
  by: ShelfGrouping,
  key: string,
  sortId?: SortChoice["id"],
): string {
  const query = new URLSearchParams({ by, key });
  if (sortId !== undefined && sortId !== "newest") query.set("sort", sortId);
  return `/drive/${encodeURIComponent(drive)}/apps/video/shelf?${query.toString()}`;
}
