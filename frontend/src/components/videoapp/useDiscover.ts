"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { getDriveFiles, getShelves, type ShelfItem } from "@/lib/api";
import {
  loadSlotProvider,
  sortSlotEntries,
  type ShelfProvider,
  type SlotEntry,
} from "@/lib/addons";
import { slotEntryLabel } from "@/lib/slotLabel";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { isViewerRequired } from "./useVideoApp";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { useAddonSlots } from "@/components/AddonSlotsProvider";

export const DISCOVER_SHELF_SIZE = 12;
const RESTRICT_SHELF_SIZE = 60;
const RECOMMENDED_SLOT = "video-discover-recommended";
const SHELVES_SLOT = "video-discover-shelves";

interface ShelfSource {
  state: LoadState<ShelfItem[]>;
  retry: () => void;
}

export interface AddonShelf extends ShelfSource {
  id: string;
  title: string;
  href?: string;
}

const noRetry = () => {};

/** The entry fields whose change asks the providers again; a label rename does not. */
function entriesKey(entries: readonly SlotEntry[]): string {
  return JSON.stringify(
    entries.map((entry) => [
      entry.addonName ?? null,
      entry.id,
      entry.priority,
      entry.href ?? null,
      entry.i18n_key ?? null,
    ]),
  );
}

/** The provider's ids in its order, deduplicated and limited to what this call's restrict accepted. */
function buildShelf(ids: readonly string[], accepted: Map<string, ShelfItem>): ShelfItem[] {
  const seen = new Set<string>();
  const items: ShelfItem[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const item = accepted.get(id);
    if (!item) continue;
    seen.add(id);
    items.push(item);
    if (items.length === DISCOVER_SHELF_SIZE) break;
  }
  return items;
}

function createRestrict({
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

/**
 * The Discover shelves. Continue and New keep their states; Recommended and
 * each addon shelf come from a provider, so they are asked only once the
 * catalogue for this drive has loaded and only after Discover has been shown.
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
  const { slots, loading: catalogueLoading, catalogueDrive } = useAddonSlots();
  const tGlobal = useTranslations();

  const [asked, setAsked] = useState(false);
  if (wanted && !asked) setAsked(true);
  const active = asked && params !== null;
  const catalogueReady = !catalogueLoading && catalogueDrive === drive;

  const recommendedEntries = slots[RECOMMENDED_SLOT] ?? [];
  const recommendedKey = entriesKey(recommendedEntries);
  const recommendedEntriesRef = useRef(recommendedEntries);
  recommendedEntriesRef.current = recommendedEntries;

  const shelfEntries = slots[SHELVES_SLOT] ?? [];
  const shelvesKey = entriesKey(shelfEntries);
  const shelfEntriesRef = useRef(shelfEntries);
  shelfEntriesRef.current = shelfEntries;

  const [recommended, setRecommended] = useState<LoadState<ShelfItem[]>>({ status: "idle" });
  const [shelfStates, setShelfStates] = useState<
    Record<string, LoadState<ShelfItem[]>>
  >({});

  useEffect(() => {
    if (!active || !catalogueReady || !hasProfile || params === null) {
      setRecommended({ status: "idle" });
      return;
    }
    let current = true;
    setRecommended({ status: "loading" });
    const accepted = new Map<string, ShelfItem>();
    const restrict = createRestrict({
      drive,
      target: params,
      watch: "unwatched",
      accepted,
      isCurrent: () => current,
      onViewerRejected,
    });

    const run = async () => {
      let provider: ShelfProvider | null = null;
      for (const entry of sortSlotEntries(recommendedEntriesRef.current)) {
        provider = await loadSlotProvider(entry);
        if (provider || !current) break;
      }
      if (!current) return;
      if (!provider) {
        setRecommended({ status: "loaded", data: [] });
        return;
      }
      const ids = await provider({ drive, limit: DISCOVER_SHELF_SIZE, restrict });
      if (!current) return;
      setRecommended({ status: "loaded", data: buildShelf(ids, accepted) });
    };

    run().catch(() => {
      if (current) setRecommended({ status: "failed" });
    });
    return () => {
      current = false;
    };
  }, [
    active,
    catalogueReady,
    hasProfile,
    drive,
    params,
    recommendedKey,
    onViewerRejected,
  ]);

  useEffect(() => {
    if (!active || !catalogueReady || params === null) {
      setShelfStates({});
      return;
    }
    let current = true;
    const entries = sortSlotEntries(shelfEntriesRef.current);
    const loading: Record<string, LoadState<ShelfItem[]>> = {};
    for (const entry of entries) loading[entry.id] = { status: "loading" };
    setShelfStates(loading);

    for (const entry of entries) {
      const accepted = new Map<string, ShelfItem>();
      const restrict = createRestrict({
        drive,
        target: params,
        accepted,
        isCurrent: () => current,
        onViewerRejected,
      });
      const run = async () => {
        const provider = await loadSlotProvider(entry);
        if (!current) return;
        if (!provider) {
          setShelfStates((held) => ({
            ...held,
            [entry.id]: { status: "loaded", data: [] },
          }));
          return;
        }
        const ids = await provider({ drive, limit: DISCOVER_SHELF_SIZE, restrict });
        if (!current) return;
        setShelfStates((held) => ({
          ...held,
          [entry.id]: { status: "loaded", data: buildShelf(ids, accepted) },
        }));
      };
      run().catch(() => {
        if (current) {
          setShelfStates((held) => ({
            ...held,
            [entry.id]: { status: "failed" },
          }));
        }
      });
    }
    return () => {
      current = false;
    };
  }, [active, catalogueReady, drive, params, shelvesKey, onViewerRejected]);

  const watchShelf = useCallback(
    (key: "in_progress", sort: "last_played") => {
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
    () => (active && hasProfile ? () => watchShelf("in_progress", "last_played") : null),
    [active, hasProfile, watchShelf],
  );
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

  const addonShelves: AddonShelf[] = sortSlotEntries(shelfEntries).map((entry) => ({
    id: entry.id,
    title: slotEntryLabel(entry, tGlobal),
    href: entry.href ? `/drive/${encodeURIComponent(drive)}/${entry.href}` : undefined,
    state: shelfStates[entry.id] ?? { status: "idle" },
    retry: noRetry,
  }));

  return {
    continueShelf: useLoad(loadContinue),
    recommended: { state: recommended, retry: noRetry },
    addonShelves,
    fresh: useLoad(loadNew),
  };
}
