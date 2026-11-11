"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";

import { useAddonSlots } from "@/components/AddonSlotsProvider";
import {
  loadSlotPageProvider,
  sortSlotEntries,
  type ShelfPageProvider,
  type SlotEntry,
} from "@/lib/addons";
import type { ShelfItem } from "@/lib/api";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { stableJson } from "./discoverCache";
import { createRestrict } from "./restrict";

const SHELVES_SLOT = "video-discover-shelves";
const RECOMMENDED_SLOT = "video-discover-recommended";
const PAGE_SIZE = 60;

export type ProviderPagePhase =
  | "waiting"
  | "no-target"
  | "absent"
  | "loading"
  | "failed"
  | "ready"
  | "ended";

interface PageState {
  key: string;
  phase: ProviderPagePhase;
  entry: SlotEntry | null;
  items: ShelfItem[];
  bylines: Map<string, string>;
  cursor: string | null;
  more: "idle" | "loading" | "failed";
}

interface Runtime {
  seq: number;
  provider: ShelfPageProvider;
  restrict: (ids: string[]) => Promise<string[]>;
  accepted: Map<string, ShelfItem>;
  cursor: string | null;
  items: ShelfItem[];
  bylines: Map<string, string>;
  seen: Set<string>;
  moreLoading: boolean;
  ended: boolean;
}

function emptyState(key: string, phase: ProviderPagePhase, entry: SlotEntry | null): PageState {
  return { key, phase, entry, items: [], bylines: new Map(), cursor: null, more: "idle" };
}

/** Only a non-empty string continues: any other cursor is the end of the list. */
function nextCursor(answer: unknown): string | null {
  if (answer === null || typeof answer !== "object") return null;
  const cursor = (answer as { cursor?: unknown }).cursor;
  return typeof cursor === "string" && cursor !== "" ? cursor : null;
}

/** The answer's items, or `null` when the answer is malformed. */
function answerItems(answer: unknown): readonly unknown[] | null {
  if (answer === null || typeof answer !== "object") return null;
  const items = (answer as { items?: unknown }).items;
  return Array.isArray(items) ? items : null;
}

/** Adds the items accepted by this load's restrict, dropping repeats and unusable entries. */
function addPage(ctx: Runtime, rawItems: readonly unknown[]): number {
  let added = 0;
  for (const raw of rawItems) {
    if (raw === null || typeof raw !== "object") continue;
    const { id, byline } = raw as { id?: unknown; byline?: unknown };
    if (typeof id !== "string" || id === "") continue;
    if (ctx.seen.has(id)) continue;
    const item = ctx.accepted.get(id);
    if (!item) continue;
    ctx.seen.add(id);
    ctx.items.push(item);
    if (typeof byline === "string" && byline !== "") ctx.bylines.set(id, byline);
    added += 1;
  }
  return added;
}

/**
 * One addon page provider's items, cursor by cursor, under the app's target.
 * A new drive, target, entry, locale or entry list starts over and drops any
 * answer still in flight for the old load; Recommended mode adds the profile,
 * the nickname and its own entry list.
 */
export function useProviderShelfPage({
  enabled,
  entryId,
  recommended,
  nickname,
  hasProfile,
  drive,
  params,
  ready,
  empty,
  onViewerRejected,
}: {
  enabled: boolean;
  entryId: string | null;
  recommended: boolean;
  nickname: string | null;
  hasProfile: boolean;
  drive: string;
  params: VideoTargetParams | null;
  ready: boolean;
  empty: boolean;
  onViewerRejected: () => void;
}): {
  phase: ProviderPagePhase;
  entry: SlotEntry | null;
  items: ShelfItem[];
  bylines: ReadonlyMap<string, string>;
  more: "idle" | "loading" | "failed";
  hasMore: boolean;
  retryFirst: () => void;
  loadMore: () => void;
} {
  const locale = useLocale();
  const { slots, loading: catalogueLoading, catalogueDrive } = useAddonSlots();
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const entriesKey = useMemo(() => {
    const entries = slots[recommended ? RECOMMENDED_SLOT : SHELVES_SLOT] ?? [];
    return stableJson(
      entries.map((entry) => [
        entry.addonName ?? null,
        entry.id,
        entry.priority,
        entry.href ?? null,
        entry.i18n_key ?? null,
      ]),
    );
  }, [slots, recommended]);
  const loadKey = useMemo(
    () =>
      recommended
        ? stableJson([
            drive,
            params ?? null,
            entryId,
            locale,
            nickname ?? null,
            hasProfile,
            RECOMMENDED_SLOT,
            entriesKey,
          ])
        : stableJson([drive, params ?? null, entryId, locale, entriesKey]),
    [recommended, drive, params, entryId, locale, nickname, hasProfile, entriesKey],
  );

  const catalogueReady = !catalogueLoading && catalogueDrive === drive;
  const targetReady = ready && params !== null;
  const [attempt, setAttempt] = useState(0);
  const [held, setHeld] = useState<PageState>(() => emptyState("", "waiting", null));
  const state = held.key === loadKey ? held : emptyState(loadKey, "waiting", null);

  const seq = useRef(0);
  const runtime = useRef<Runtime | null>(null);
  const onRejected = useRef(onViewerRejected);
  onRejected.current = onViewerRejected;

  useEffect(() => {
    if (!enabled || entryId === null) {
      seq.current += 1;
      runtime.current = null;
      setHeld(emptyState(loadKey, "waiting", null));
      return;
    }
    const my = ++seq.current;
    runtime.current = null;

    if (!catalogueReady) {
      setHeld(emptyState(loadKey, "waiting", null));
      return;
    }
    if (empty) {
      setHeld(emptyState(loadKey, "no-target", null));
      return;
    }
    if (!targetReady) {
      setHeld(emptyState(loadKey, "waiting", null));
      return;
    }

    const target = paramsRef.current;
    if (target === null) {
      setHeld(emptyState(loadKey, "waiting", null));
      return;
    }
    const entry = sortSlotEntries(
      slotsRef.current[recommended ? RECOMMENDED_SLOT : SHELVES_SLOT] ?? [],
    ).find((candidate) => candidate.id === entryId);
    if (!entry) {
      setHeld(emptyState(loadKey, "absent", null));
      return;
    }

    setHeld(emptyState(loadKey, "waiting", entry));

    void (async () => {
      const provider = await loadSlotPageProvider(entry);
      if (my !== seq.current) return;
      if (recommended && !hasProfile) {
        setHeld(emptyState(loadKey, "absent", null));
        return;
      }
      if (!provider) {
        setHeld(emptyState(loadKey, "absent", null));
        return;
      }

      const accepted = new Map<string, ShelfItem>();
      const restrict = createRestrict({
        drive,
        target,
        ...(recommended ? { watch: "unwatched" } : {}),
        accepted,
        isCurrent: () => my === seq.current,
        onViewerRejected: () => onRejected.current(),
      });
      const ctx: Runtime = {
        seq: my,
        provider,
        restrict,
        accepted,
        cursor: null,
        items: [],
        bylines: new Map(),
        seen: new Set(),
        moreLoading: false,
        ended: false,
      };
      runtime.current = ctx;
      setHeld(emptyState(loadKey, "loading", entry));

      try {
        const answer = await provider({ drive, locale, limit: PAGE_SIZE, cursor: null, restrict });
        if (my !== seq.current) return;
        const raw = answerItems(answer);
        if (raw === null) {
          setHeld((now) => (now.key === loadKey ? { ...now, phase: "failed" } : now));
          return;
        }
        const added = addPage(ctx, raw);
        const cursor = nextCursor(answer);
        ctx.cursor = cursor;
        ctx.ended = added === 0 || cursor === null;
        setHeld({
          key: loadKey,
          phase: ctx.ended ? "ended" : "ready",
          entry,
          items: ctx.items,
          bylines: new Map(ctx.bylines),
          cursor,
          more: "idle",
        });
      } catch {
        if (my !== seq.current) return;
        setHeld((now) => (now.key === loadKey ? { ...now, phase: "failed" } : now));
      }
    })();

    return () => {
      if (seq.current === my) seq.current += 1;
    };
  }, [
    enabled,
    entryId,
    loadKey,
    catalogueReady,
    targetReady,
    empty,
    drive,
    locale,
    recommended,
    hasProfile,
    attempt,
  ]);

  const retryFirst = useCallback(() => setAttempt((n) => n + 1), []);

  const loadMore = useCallback(() => {
    const ctx = runtime.current;
    if (
      !ctx ||
      ctx.seq !== seq.current ||
      ctx.cursor === null ||
      ctx.ended ||
      ctx.moreLoading
    ) {
      return;
    }
    ctx.moreLoading = true;
    const cursor = ctx.cursor;
    setHeld((now) => (now.key === loadKey ? { ...now, more: "loading" } : now));

    void (async () => {
      try {
        const answer = await ctx.provider({
          drive,
          locale,
          limit: PAGE_SIZE,
          cursor,
          restrict: ctx.restrict,
        });
        if (ctx.seq !== seq.current) return;
        const raw = answerItems(answer);
        if (raw === null) {
          ctx.moreLoading = false;
          setHeld((now) => (now.key === loadKey ? { ...now, more: "failed" } : now));
          return;
        }
        const added = addPage(ctx, raw);
        const next = nextCursor(answer);
        ctx.cursor = next;
        ctx.moreLoading = false;
        ctx.ended = added === 0 || next === null;
        setHeld((now) =>
          now.key === loadKey
            ? {
                ...now,
                items: ctx.items,
                bylines: new Map(ctx.bylines),
                cursor: next,
                more: "idle",
                phase: ctx.ended ? "ended" : "ready",
              }
            : now,
        );
      } catch {
        ctx.moreLoading = false;
        if (ctx.seq === seq.current) {
          setHeld((now) => (now.key === loadKey ? { ...now, more: "failed" } : now));
        }
      }
    })();
  }, [drive, locale, loadKey]);

  return {
    phase: state.phase,
    entry: state.entry,
    items: state.items,
    bylines: state.bylines,
    more: state.more,
    hasMore: state.phase === "ready" && state.more === "idle" && state.cursor !== null,
    retryFirst,
    loadMore,
  };
}
