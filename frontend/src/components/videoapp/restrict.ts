import { getShelves, type ShelfItem } from "@/lib/api";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { isViewerRequired } from "./useVideoApp";

export const RESTRICT_SHELF_SIZE = 60;

export function createRestrict({
  drive,
  target,
  watch,
  accepted,
  isCurrent,
  onViewerRejected,
}: {
  drive: string;
  target: VideoTargetParams;
  watch?: "unwatched";
  accepted: Map<string, ShelfItem>;
  isCurrent: () => boolean;
  onViewerRejected: () => void;
}): (ids: string[]) => Promise<string[]> {
  return async (ids) => {
    if (ids.length === 0) return [];
    const matched: string[] = [];
    for (let offset = 0; offset < ids.length; offset += RESTRICT_SHELF_SIZE) {
      const chunk = ids.slice(offset, offset + RESTRICT_SHELF_SIZE);
      let response;
      try {
        response = await getShelves(drive, {
          ...target,
          by: "all",
          key: "all",
          per_shelf: RESTRICT_SHELF_SIZE,
          ids: chunk,
          ...(watch ? { watch } : {}),
        });
      } catch (error) {
        if (isViewerRequired(error) && isCurrent()) onViewerRejected();
        throw error;
      }
      const returned = new Map<string, ShelfItem>();
      for (const shelf of response.shelves) {
        for (const item of shelf.items) returned.set(item.id, item);
      }
      for (const [id, item] of returned) accepted.set(id, item);
      for (const id of chunk) if (returned.has(id)) matched.push(id);
    }
    return matched;
  };
}
