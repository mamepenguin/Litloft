"use client";

import { useCallback, useMemo, useState } from "react";

import { getDriveFiles, getShelves, type ShelfItem } from "@/lib/api";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { isViewerRequired } from "./useVideoApp";
import { useLoad } from "@/components/appshell/useLoad";

export const DISCOVER_SHELF_SIZE = 12;

/**
 * The three Discover shelves. Their results live here, above the faces, so
 * Recommended keeps its sample while the viewer visits Library and returns;
 * a face that was never shown asks for nothing.
 */
export function useDiscover({
  drive,
  params,
  hasProfile,
  wanted,
  onViewerRejected,
}: {
  drive: string;
  params: VideoTargetParams | null;
  hasProfile: boolean;
  /** Discover is the face on screen. Once true, it stays asked for. */
  wanted: boolean;
  onViewerRejected: () => void;
}) {
  const [asked, setAsked] = useState(false);
  if (wanted && !asked) setAsked(true);
  const active = asked && params !== null;

  const watchShelf = useCallback(
    (key: "continue" | "unwatched", sort: "last_played" | "random") => {
      if (params === null) return Promise.resolve<ShelfItem[]>([]);
      return getShelves(drive, {
        ...params,
        by: "watch",
        key,
        sort,
        per_shelf: DISCOVER_SHELF_SIZE,
      }).then(
        (response) => response.shelves[0]?.items ?? [],
        (error: unknown) => {
          if (isViewerRequired(error)) onViewerRejected();
          throw error;
        },
      );
    },
    [drive, params, onViewerRejected],
  );

  const loadContinue = useMemo(
    () => (active && hasProfile ? () => watchShelf("continue", "last_played") : null),
    [active, hasProfile, watchShelf],
  );
  const loadRecommended = useMemo(() => {
    if (!active || params === null) return null;
    return hasProfile
      ? () => watchShelf("unwatched", "random")
      : () =>
          getDriveFiles(drive, { ...params, sort: "random", limit: DISCOVER_SHELF_SIZE }).then(
            (page) => page.data as ShelfItem[],
          );
  }, [active, hasProfile, params, drive, watchShelf]);
  const loadNew = useMemo(
    () =>
      active && params !== null
        ? () =>
            getDriveFiles(drive, {
              ...params,
              sort: "created_at",
              order: "desc",
              limit: DISCOVER_SHELF_SIZE,
            }).then((page) => page.data as ShelfItem[])
        : null,
    [active, params, drive],
  );

  return {
    continueShelf: useLoad(loadContinue),
    recommended: useLoad(loadRecommended),
    fresh: useLoad(loadNew),
  };
}
