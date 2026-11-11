"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { getDriveFiles, getShelves, type ShelfItem } from "@/lib/api";
import {
  loadSlotPageProvider,
  loadSlotProvider,
  sortSlotEntries,
  type ShelfPageProvider,
  type ShelfProvider,
  type SlotEntry,
} from "@/lib/addons";
import { slotEntryLabel } from "@/lib/slotLabel";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import type { ShelfView } from "@/components/appshell/ShelfBlock";
import { useLoad, type LoadState } from "@/components/appshell/useLoad";
import { useAddonSlots } from "@/components/AddonSlotsProvider";
import { isViewerRequired } from "./useVideoApp";
import {
  discoverCacheKey,
  localDate,
  readCachedItems,
  stableJson,
  writeCachedItems,
  type CachedItem,
} from "./discoverCache";
import { drawnPrefix } from "./discoverPrefix";
import { createRestrict } from "./restrict";
import { providerShelfHref, videoShelfHref } from "./shelfLinks";

export const DISCOVER_SHELF_SIZE = 12;
const RECOMMENDED_SLOT = "video-discover-recommended";
const SHELVES_SLOT = "video-discover-shelves";

/** Past this, a provider shelf not yet settled is left out for the rest of the visit. */
export const PROVIDER_DEADLINE_MS = 800;

export interface DrawnShelf {
  id: string;
  title: string;
  href?: string;
  state: ShelfView<ShelfItem>;
  bylines?: ReadonlyMap<string, string>;
  retry: () => void;
}

const noRetry = () => {};

/** The entry fields whose change makes a stored Recommended list belong to another key. */
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

/**
 * The provider's order, deduplicated and limited to what this call's restrict
 * accepted. An item that is not an object or has no usable id is skipped
 * without disturbing the rest.
 */
function buildShelf(
  rawItems: readonly unknown[],
  accepted: Map<string, ShelfItem>,
  limit: number,
): { items: ShelfItem[]; bylines: Map<string, string> } {
  const seen = new Set<string>();
  const items: ShelfItem[] = [];
  const bylines = new Map<string, string>();
  for (const raw of rawItems) {
    if (raw === null || typeof raw !== "object") continue;
    const { id, byline } = raw as { id?: unknown; byline?: unknown };
    if (typeof id !== "string" || id === "") continue;
    if (seen.has(id)) continue;
    const item = accepted.get(id);
    if (!item) continue;
    seen.add(id);
    items.push(item);
    if (typeof byline === "string" && byline !== "") bylines.set(id, byline);
    if (items.length === limit) break;
  }
  return { items, bylines };
}

type ProviderStatus = "loading" | "loaded" | "failed" | "absent" | "dropped";

interface ProviderRuntime {
  status: ProviderStatus;
  items: ShelfItem[];
  bylines: Map<string, string>;
}

interface VisitEntries {
  recommended: SlotEntry[];
  addons: SlotEntry[];
}

interface Visit {
  key: string;
  drive: string;
  params: VideoTargetParams;
  hasProfile: boolean;
  nickname: string | null;
  date: string;
  /** Read when the catalogue for the drive becomes ready; fixed for the visit. */
  entries: VisitEntries | null;
  /** Entries whose addon exports a page provider, so See all opens the core page. */
  pageEntries: Set<string>;
  /** Recommended's See all, once the chosen entry's page provider lookup settles. */
  recommendedHref: string | null;
  addonsVisible: boolean;
  states: Map<string, ProviderRuntime>;
  continueSettled: boolean;
  newSettled: boolean;
  deadline: boolean;
  asked: boolean;
}

type Position =
  | { id: string; kind: "core"; shelf: "continue" | "new" }
  | { id: string; kind: "provider"; title: string; href?: string }
  | { id: string; kind: "placeholder" };

function isSettledCore(state: LoadState<ShelfItem[]>): boolean {
  return state.status !== "loading";
}

function viewOf(state: LoadState<ShelfItem[]>): ShelfView<ShelfItem> {
  if (state.status === "loaded") return { status: "loaded", items: state.data };
  if (state.status === "failed") return { status: "failed" };
  return { status: "loading" };
}

function recommendedCacheKey(visit: Visit, entries: readonly SlotEntry[]): string {
  return discoverCacheKey({
    drive: visit.drive,
    params: visit.params,
    slot: RECOMMENDED_SLOT,
    date: visit.date,
    nickname: visit.nickname,
    entriesKey: entriesKey(entries),
  });
}

function addonCacheKey(visit: Visit, entry: SlotEntry, locale: string): string {
  return discoverCacheKey({
    drive: visit.drive,
    params: visit.params,
    slot: SHELVES_SLOT,
    date: visit.date,
    addonName: entry.addonName ?? null,
    entryId: entry.id,
    locale,
  });
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
  nickname,
  wanted,
  onViewerRejected,
}: {
  drive: string;
  params: VideoTargetParams | null;
  hasProfile: boolean;
  nickname: string | null;
  /** Discover is the face on screen. Once true, it stays asked for. */
  wanted: boolean;
  onViewerRejected: () => void;
}) {
  const { slots, loading: catalogueLoading, catalogueDrive } = useAddonSlots();
  const locale = useLocale();
  const tGlobal = useTranslations();
  const t = useTranslations("videoApp.shelves");

  const [asked, setAsked] = useState(false);
  if (wanted && !asked) setAsked(true);
  const active = asked && params !== null;
  const catalogueReady = !catalogueLoading && catalogueDrive === drive;

  const visitKey = useMemo(
    () => stableJson([drive, params ?? null, hasProfile, nickname ?? null]),
    [drive, params, hasProfile, nickname],
  );

  const [visit, setVisit] = useState<Visit | null>(null);
  let current: Visit | null = active ? visit : null;
  if (active && (current === null || current.key !== visitKey)) {
    current = {
      key: visitKey,
      drive,
      params: params!,
      hasProfile,
      nickname,
      date: "",
      entries: null,
      pageEntries: new Set(),
      recommendedHref: null,
      addonsVisible: true,
      states: new Map(),
      continueSettled: false,
      newSettled: false,
      deadline: false,
      asked: false,
    };
    setVisit(current);
  } else if (!active && visit !== null) {
    setVisit(null);
  }

  const [, rerender] = useReducer((version: number) => version + 1, 0);
  const liveVisit = useRef<Visit | null>(null);
  liveVisit.current = current;
  const onRejected = useRef(onViewerRejected);
  onRejected.current = onViewerRejected;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadContinue = useMemo(() => {
    if (!active || !hasProfile || current === null) return null;
    const visitParams = current.params;
    const visitDrive = current.drive;
    return () =>
      getShelves(visitDrive, {
        ...visitParams,
        by: "watch",
        key: "continue",
        sort: "last_played",
        per_shelf: DISCOVER_SHELF_SIZE,
      }).then(
        (response) => response.shelves[0]?.items ?? [],
        (error: unknown) => {
          if (isViewerRequired(error)) onRejected.current();
          throw error;
        },
      );
  }, [active, hasProfile, current]);

  const loadNew = useMemo(() => {
    if (!active || current === null) return null;
    const visitParams = current.params;
    const visitDrive = current.drive;
    return () =>
      getDriveFiles(visitDrive, {
        ...visitParams,
        sort: "created_at",
        order: "desc",
        limit: DISCOVER_SHELF_SIZE,
      }).then((page) => page.data as ShelfItem[]);
  }, [active, current]);

  const { state: continueState, retry: retryContinue } = useLoad(loadContinue);
  const { state: newState, retry: retryNew } = useLoad(loadNew);

  useEffect(() => {
    if (current === null) return;
    let changed = false;
    if (!current.continueSettled && isSettledCore(continueState)) {
      current.continueSettled = true;
      changed = true;
    }
    if (!current.newSettled && isSettledCore(newState)) {
      current.newSettled = true;
      changed = true;
    }
    if (changed) rerender();
  }, [current, continueState, newState]);

  useEffect(() => {
    if (current === null || current.deadline) return;
    const visit = current;
    const timer = setTimeout(() => {
      visit.deadline = true;
      if (visit.entries === null) visit.addonsVisible = false;
      for (const runtime of visit.states.values()) {
        if (runtime.status === "loading") runtime.status = "dropped";
      }
      rerender();
    }, PROVIDER_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [current]);

  useEffect(() => {
    if (current === null || !catalogueReady || current.asked) return;
    const visit = current;
    visit.asked = true;
    visit.date = localDate();
    visit.entries = {
      recommended: slots[RECOMMENDED_SLOT] ?? [],
      addons: slots[SHELVES_SLOT] ?? [],
    };

    const live = () => mounted.current && liveVisit.current === visit;
    const commit = (change: () => void) => {
      if (!live()) return;
      change();
      rerender();
    };

    const start = (
      id: string,
      entries: readonly SlotEntry[],
      cacheKey: string,
      options: { watch?: "unwatched"; preferPageProvider?: boolean; recommended?: boolean } = {},
    ) => {
      if (entries.length === 0) {
        commit(() => {
          visit.states.set(id, { status: "absent", items: [], bylines: new Map() });
        });
        return;
      }
      const runtime: ProviderRuntime = {
        status: visit.deadline ? "dropped" : "loading",
        items: [],
        bylines: new Map(),
      };
      visit.states.set(id, runtime);
      const settled = () => runtime.status !== "loading";
      const accepted = new Map<string, ShelfItem>();
      const restrict = createRestrict({
        drive: visit.drive,
        target: visit.params,
        watch: options.watch,
        accepted,
        isCurrent: () => live() && !settled(),
        onViewerRejected: () => onRejected.current(),
      });

      void (async () => {
        let pageProvider: ShelfPageProvider | null = null;
        let pageEntry: SlotEntry | null = null;
        if (options.preferPageProvider) {
          for (const entry of sortSlotEntries(entries)) {
            pageProvider = await loadSlotPageProvider(entry);
            if (pageProvider) {
              pageEntry = entry;
              break;
            }
          }
          if (pageProvider && pageEntry) {
            const marked = pageEntry;
            commit(() => {
              visit.pageEntries.add(marked.id);
            });
          }
        }
        let provider: ShelfProvider | null = null;
        let providerEntry: SlotEntry | null = null;
        if (!pageProvider) {
          for (const entry of sortSlotEntries(entries)) {
            provider = await loadSlotProvider(entry);
            if (provider) {
              providerEntry = entry;
              break;
            }
          }
        }
        if (!pageProvider && !provider) {
          commit(() => {
            if (settled()) return;
            runtime.status = "absent";
          });
          return;
        }

        if (options.recommended && providerEntry) {
          const chosen = providerEntry;
          void (async () => {
            const page = await loadSlotPageProvider(chosen);
            if (!page) return;
            commit(() => {
              visit.recommendedHref = providerShelfHref(visit.drive, chosen.id, "recommended");
            });
          })();
        }

        const stored = readCachedItems(cacheKey);
        if (stored !== undefined && stored.length > 0) {
          void (async () => {
            try {
              await restrict(stored.map((item) => item.id));
              const rebuilt = buildShelf(stored, accepted, DISCOVER_SHELF_SIZE);
              if (rebuilt.items.length === 0) return;
              commit(() => {
                if (settled()) return;
                runtime.status = "loaded";
                runtime.items = rebuilt.items;
                runtime.bylines = rebuilt.bylines;
              });
            } catch {
              // The provider's answer still decides this visit.
            }
          })();
        }

        try {
          let rawItems: readonly unknown[];
          if (pageProvider) {
            const answer = await pageProvider({
              drive: visit.drive,
              locale,
              limit: DISCOVER_SHELF_SIZE,
              cursor: null,
              restrict,
            });
            if (!answer || !Array.isArray(answer.items)) {
              commit(() => {
                if (settled()) return;
                runtime.status = "failed";
              });
              return;
            }
            rawItems = answer.items;
          } else if (provider) {
            const ids = await provider({
              drive: visit.drive,
              limit: DISCOVER_SHELF_SIZE,
              restrict,
            });
            rawItems = ids.map((itemId) => ({ id: itemId }));
          } else {
            return;
          }
          const drawn = buildShelf(rawItems, accepted, DISCOVER_SHELF_SIZE);
          const cached: CachedItem[] = drawn.items.map((item) => {
            const byline = drawn.bylines.get(item.id);
            return byline === undefined ? { id: item.id } : { id: item.id, byline };
          });
          writeCachedItems(cacheKey, cached);
          commit(() => {
            if (settled()) return;
            runtime.status = "loaded";
            runtime.items = drawn.items;
            runtime.bylines = drawn.bylines;
          });
        } catch {
          commit(() => {
            if (settled()) return;
            runtime.status = "failed";
          });
        }
      })();
    };

    if (visit.hasProfile) {
      start(
        "recommended",
        visit.entries.recommended,
        recommendedCacheKey(visit, visit.entries.recommended),
        { watch: "unwatched", recommended: true },
      );
    }
    for (const entry of sortSlotEntries(visit.entries.addons)) {
      start(`addon:${entry.id}`, [entry], addonCacheKey(visit, entry, locale), {
        preferPageProvider: true,
      });
    }

    rerender();
  }, [current, catalogueReady, slots, locale]);

  const positions: Position[] = [];
  if (current !== null) {
    positions.push({ id: "continue", kind: "core", shelf: "continue" });
    positions.push({
      id: "recommended",
      kind: "provider",
      title: t("recommended"),
      ...(current.recommendedHref ? { href: current.recommendedHref } : {}),
    });
    if (current.addonsVisible) {
      if (current.entries === null) {
        positions.push({ id: "addons", kind: "placeholder" });
      } else {
        for (const entry of sortSlotEntries(current.entries.addons)) {
          let href: string | undefined;
          if (current.pageEntries.has(entry.id)) {
            href = providerShelfHref(drive, entry.id);
          } else if (entry.href) {
            href = `/drive/${encodeURIComponent(drive)}/${entry.href}`;
          }
          positions.push({
            id: `addon:${entry.id}`,
            kind: "provider",
            title: slotEntryLabel(entry, tGlobal),
            ...(href ? { href } : {}),
          });
        }
      }
    }
    positions.push({ id: "new", kind: "core", shelf: "new" });
  }

  const settledAt = (position: Position): boolean => {
    if (current === null) return true;
    if (position.kind === "core") {
      return position.shelf === "continue" ? current.continueSettled : current.newSettled;
    }
    if (position.kind === "placeholder") return current.deadline;
    if (position.id === "recommended" && !current.hasProfile) return true;
    const runtime = current.states.get(position.id);
    if (runtime === undefined) return current.deadline;
    return runtime.status !== "loading";
  };

  const drawn = drawnPrefix(positions.map(settledAt));
  const shelves: DrawnShelf[] = [];
  for (const position of positions.slice(0, drawn)) {
    if (position.kind === "core") {
      const state = position.shelf === "continue" ? continueState : newState;
      if (state.status === "idle") continue;
      if (state.status === "loaded" && state.data.length === 0) continue;
      const shelfHref =
        position.shelf === "continue"
          ? videoShelfHref(drive, "watch", "continue", undefined, "discover")
          : videoShelfHref(drive, "all", "all", undefined, "discover");
      shelves.push({
        id: position.id,
        title: t(position.shelf === "continue" ? "continue" : "new"),
        href: shelfHref,
        state: viewOf(state),
        retry: position.shelf === "continue" ? retryContinue : retryNew,
      });
      continue;
    }
    if (position.kind !== "provider" || current === null) continue;
    const runtime = current.states.get(position.id);
    if (runtime === undefined || runtime.status !== "loaded" || runtime.items.length === 0) continue;
    shelves.push({
      id: position.id,
      title: position.title,
      ...(position.href ? { href: position.href } : {}),
      ...(runtime.bylines.size > 0 ? { bylines: runtime.bylines } : {}),
      state: { status: "loaded", items: runtime.items },
      retry: noRetry,
    });
  }

  const coreSettled = [continueState, newState].every(
    (state) => state.status === "loaded" || state.status === "idle",
  );
  const coreEmpty = [continueState, newState].every(
    (state) =>
      state.status === "idle" || (state.status === "loaded" && state.data.length === 0),
  );

  return {
    shelves,
    pending: positions.length > 0 && drawn < positions.length,
    empty: active && coreSettled && coreEmpty,
  };
}
