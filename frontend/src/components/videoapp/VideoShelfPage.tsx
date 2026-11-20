"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Film } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import {
  CardFileMenuProvider,
  pagedParams,
  useCardFileMenu,
} from "@/components/appshell/CardFileMenu";
import { NameFilter } from "@/components/appshell/NameFilter";
import { RetryButton } from "@/components/appshell/RetryButton";
import { mergeLibraryTags } from "@/components/appshell/libraryFilters";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { VideoGrid } from "@/components/appshell/VideoGrid";
import { PageFrame } from "@/components/PageFrame";
import { builtinApps } from "@/lib/builtinApps";
import { loadSlotItemActions, type ShelfItemAction } from "@/lib/addons";
import { type ShelfGrouping, type ShelfItem, type ShelfWatchState } from "@/lib/api";
import { slotEntryLabel } from "@/lib/slotLabel";
import { stableJson } from "./discoverCache";
import { SortChoiceMenu } from "./LibraryControls";
import {
  CONTINUE_SORT_CHOICES,
  SORT_CHOICES,
  parseShelfSortId,
  shelfTitle,
  type ShelfSortChoice,
} from "./labels";
import { useProviderShelfPage } from "./useProviderShelfPage";
import { useRemovableItems } from "./useRemovableItems";
import { isViewerRequired, useVideoApp } from "./useVideoApp";
import { VideoAppHeader } from "./VideoAppHeader";
import { VideoCard, type VideoCardMenu } from "./VideoCard";
import { SkeletonGrid, VideoPagedGrid } from "./VideoPagedGrid";

export const SHELF_PAGE_SIZE = 60;

const GROUPINGS: readonly ShelfGrouping[] = ["all", "folder", "tag", "month", "duration", "watch"];
const WATCH_STATES: readonly ShelfWatchState[] = ["in_progress", "unwatched", "finished"];

export function parseGrouping(raw: string | null): ShelfGrouping | null {
  return GROUPINGS.find((grouping) => grouping === raw) ?? null;
}

export function parseWatchState(raw: string | null): ShelfWatchState | null {
  return WATCH_STATES.find((state) => state === raw) ?? null;
}

function listOf(value: string | readonly string[] | undefined): string[] {
  return value === undefined ? [] : ([value].flat() as string[]);
}

/** One shelf of the Library, as a grid paged 60 at a time. */
export function VideoShelfPage({
  drive,
  by,
  shelfKey,
  initialSort,
  tags: urlTags,
  watch: urlWatch,
  name,
  onNameChange,
  onLeavePending,
  onTargetChosen,
  from,
  entry,
  slot,
  homeEntry,
}: {
  drive: string;
  by: ShelfGrouping | null;
  shelfKey: string;
  initialSort?: string | null;
  tags?: readonly string[];
  watch?: string | null;
  /** The URL's normalised `q`. */
  name?: string | null;
  /** An applied name; the caller replaces the URL and keeps the store. */
  onNameChange?: (name: string) => void;
  /** Called on unmount while an apply is still pending. */
  onLeavePending?: (name: string) => void;
  /** Called after a Target is chosen on this page, to drop the URL's filters. */
  onTargetChosen?: () => void;
  from?: string | null;
  /** An addon shelf to page through its page provider. */
  entry?: string | null;
  /** Which slot `entry` belongs to; `recommended` pages Recommended's provider. */
  slot?: string | null;
  /** The key of this app's Home entry. */
  homeEntry?: string;
}) {
  const t = useTranslations("videoApp");
  const tGlobal = useTranslations();
  const locale = useLocale();
  const appState = useVideoApp(drive);
  const { chooseTarget: chooseAppTarget, targetId } = appState;
  // The URL's filters stop applying in the render that shows the new Target;
  // the replace that removes them from the URL lands later.
  const urlFilters = JSON.stringify([urlTags ?? [], urlWatch ?? null, name ?? ""]);
  const [droppedFor, setDroppedFor] = useState<string | null>(null);
  const filtersDropped = droppedFor === urlFilters;
  const chooseTarget = useCallback(
    (id: string) => {
      if (id === targetId) return;
      setDroppedFor(urlFilters);
      chooseAppTarget(id);
      onTargetChosen?.();
    },
    [chooseAppTarget, onTargetChosen, targetId, urlFilters],
  );
  const state = useMemo(() => ({ ...appState, chooseTarget }), [appState, chooseTarget]);
  const entryMode = typeof entry === "string" && entry !== "";
  const recommendedMode = entryMode && slot === "recommended";
  const continuePage = !entryMode && by === "watch" && shelfKey === "continue";
  const cards = useCardFileMenu({
    scope: stableJson([
      drive,
      state.requests.key,
      state.targetId,
      state.nickname,
      state.hasProfile,
      state.params,
    ]),
    hasProfile: state.hasProfile,
    continueListKeys: continuePage ? ["page"] : [],
  });
  const removedBefore = useRef(0);
  const offered: readonly ShelfSortChoice[] =
    by === "watch" && shelfKey === "continue" ? CONTINUE_SORT_CHOICES : SORT_CHOICES;
  const initialChoice = parseShelfSortId(initialSort ?? null, offered) ?? offered[0].id;
  const scope = `${by ?? ""}\u0000${shelfKey}\u0000${initialSort ?? ""}`;
  // Keyed by the shelf: a choice must not survive a by or key change, including
  // back to a shelf visited before.
  const [selection, setSelection] = useState({ scope, id: initialChoice });
  const active = selection.scope === scope ? selection : { scope, id: initialChoice };
  if (selection.scope !== scope) setSelection(active);
  const sortId = active.id;
  const sort = offered.find((choice) => choice.id === sortId) ?? offered[0];

  // Watch state reads the viewer's rows; without a profile there is no shelf to open.
  const watchBlocked = !entryMode && by === "watch" && !state.hasProfile;
  const { params, requests, rejectViewer } = state;

  const query = useMemo<typeof params>(() => {
    if (params === null) return null;
    const merged = mergeLibraryTags(listOf(params.tag), filtersDropped ? [] : (urlTags ?? []));
    return { ...params, ...(merged.length > 0 ? { tag: merged } : {}) };
  }, [params, urlTags, filtersDropped]);

  const watch = state.hasProfile && !filtersDropped ? parseWatchState(urlWatch ?? null) : null;
  const requestedName = filtersDropped ? "" : (name ?? "");
  const listing = !entryMode && by !== null && query !== null && !watchBlocked;
  const filtersActive =
    !filtersDropped &&
    (requestedName !== "" ||
      (urlTags?.length ?? 0) > 0 ||
      parseWatchState(urlWatch ?? null) !== null);

  const fetchPage = useMemo(
    () =>
      entryMode || by === null || query === null || watchBlocked
        ? null
        : (page: number) =>
            requests
              .shelves(drive, {
                ...query,
                ...(watch ? { watch } : {}),
                ...(requestedName ? { search: requestedName } : {}),
                by,
                key: shelfKey,
                sort: sort.sort,
                order: sort.order,
                per_shelf: SHELF_PAGE_SIZE,
                ...pagedParams(page, removedBefore.current, SHELF_PAGE_SIZE),
              })
              .then(
                (response) => {
                  const shelf = response.shelves[0];
                  return { items: shelf?.items ?? [], total: shelf?.count ?? 0 };
                },
                (error: unknown) => {
                  if (isViewerRequired(error)) rejectViewer();
                  throw error;
                },
              ),
    [entryMode, drive, by, shelfKey, query, requests, watch, watchBlocked, requestedName, sort.sort, sort.order, rejectViewer],
  );
  const paged = usePaged<ShelfItem>(fetchPage, cards.context.version);
  removedBefore.current = cards.removedCount("page", paged.items);
  const pageItems = cards.filter("page", paged.items);
  const provider = useProviderShelfPage({
    enabled: entryMode,
    entryId: entryMode ? entry : null,
    recommended: recommendedMode,
    nickname: state.nickname,
    hasProfile: state.hasProfile,
    drive,
    params,
    requests,
    ready: state.ready,
    empty: state.empty,
    onViewerRejected: rejectViewer,
  });
  const removable = useRemovableItems(provider.items);
  const providerItems = cards.filter("page", removable.items);
  const [itemActions, setItemActions] = useState<ShelfItemAction[]>([]);
  const tGlobalRef = useRef(tGlobal);
  tGlobalRef.current = tGlobal;
  useEffect(() => {
    if (!recommendedMode || !state.hasProfile || provider.entry === null) {
      setItemActions([]);
      return;
    }
    let live = true;
    void loadSlotItemActions(provider.entry, {
      drive,
      locale,
      t: tGlobalRef.current,
    }).then((actions) => {
      if (live) setItemActions(actions);
    });
    return () => {
      live = false;
    };
  }, [recommendedMode, state.hasProfile, provider.entry, drive, locale]);

  const viewerRef = useRef(state.nickname);
  viewerRef.current = state.nickname;
  const isSameViewer = useCallback(
    (captured: string | null) => viewerRef.current === captured,
    [],
  );
  const { remove, restore } = removable;
  const onRemoved = useCallback((item: ShelfItem) => remove(item.id), [remove]);
  const onRestored = useCallback((item: ShelfItem) => restore(item.id), [restore]);
  const cardMenu: VideoCardMenu | undefined =
    recommendedMode &&
    state.hasProfile &&
    state.nickname !== null &&
    itemActions.length > 0
      ? {
          actions: itemActions,
          viewer: state.nickname,
          isSameViewer,
          onRemoved,
          onRestored,
        }
      : undefined;
  const sentinel = useNearEnd(entryMode && provider.hasMore, provider.loadMore);

  const title = entryMode
    ? recommendedMode
      ? t("shelves.recommended")
      : provider.entry
        ? slotEntryLabel(provider.entry, tGlobal)
        : t("title")
    : by === null
      ? t("title")
      : shelfTitle({ by, shelf: { key: shelfKey, label: "" }, drive, locale, from, t: (key) => t(key) });
  const app = builtinApps.find((candidate) => candidate.id === "video")!;

  const body = state.targetFailed ? (
    <RetryButton onRetry={state.retryTarget} />
  ) : state.targetUnusable ? (
    <EmptyState icon={Film} title={t("targetUnusable")} />
  ) : entryMode ? (
    provider.phase === "no-target" || provider.phase === "absent" ? (
      <EmptyState variant="no-files" />
    ) : provider.phase === "failed" ? (
      <RetryButton onRetry={provider.retryFirst} />
    ) : provider.phase === "ready" || provider.phase === "ended" ? (
      providerItems.length === 0 ? (
        <EmptyState variant="no-files" />
      ) : (
        <>
          <VideoGrid>
            {() =>
              providerItems.map((item) => (
                <li key={item.id} className="min-w-0">
                  <VideoCard
                    item={item}
                    byline={provider.bylines.get(item.id)}
                    menu={cardMenu}
                    fileMenu={{ listKey: "page" }}
                  />
                </li>
              ))
            }
          </VideoGrid>
          <div ref={sentinel} aria-hidden="true" className="h-px" />
          {provider.more === "loading" && (
            <div className="mt-8">
              <SkeletonGrid rows={1} />
            </div>
          )}
          {provider.more === "failed" && (
            <div className="mt-8">
              <RetryButton onRetry={provider.loadMore} />
            </div>
          )}
        </>
      )
    ) : (
      <SkeletonGrid rows={2} />
    )
  ) : (
    <VideoPagedGrid
      paged={{ ...paged, items: pageItems }}
      empty={by === null || state.empty || watchBlocked}
      filtered={filtersActive}
      listKey="page"
    />
  );

  return (
    <CardFileMenuProvider value={cards.context}>
      <PageFrame
        width="wide"
      header={
        <VideoAppHeader
          drive={drive}
          state={state}
          title={title}
          homeEntry={homeEntry}
          breadcrumb={
            <Link
              href={app.route(drive)}
              className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {t("title")}
            </Link>
          }
          actions={
            entryMode ? undefined : listing ? (
              <div className="flex w-full min-w-0 flex-col items-start gap-2 max-sm:pr-2 sm:w-auto md:flex-row md:items-center">
                <NameFilter
                  value={requestedName}
                  alwaysOpen
                  onApply={(next) => onNameChange?.(next)}
                  onLeavePending={onLeavePending}
                />
                <div className="shrink-0">
                  <SortChoiceMenu
                    choices={offered}
                    value={sortId}
                    quiet
                    onChange={(id) => setSelection({ scope, id })}
                  />
                </div>
              </div>
            ) : (
              <SortChoiceMenu
                choices={offered}
                value={sortId}
                quiet
                onChange={(id) => setSelection({ scope, id })}
              />
            )
          }
        />
      }
    >
        <div className="px-4 pb-6 pt-4 sm:pb-8">{body}</div>
      </PageFrame>
      {cards.menu}
    </CardFileMenuProvider>
  );
}
