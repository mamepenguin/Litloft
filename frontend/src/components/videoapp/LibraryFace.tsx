"use client";

import { useCallback, useMemo, useRef } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { fetchAlignedPage, useCardFileLists } from "@/components/appshell/CardFileMenu";
import { FolderPositionRows } from "@/components/appshell/FolderPositionRows";
import { RetryButton } from "@/components/appshell/RetryButton";
import { FilterMenus } from "@/components/appshell/FilterMenus";
import { mergeLibraryTags, useLibraryFilters } from "@/components/appshell/libraryFilters";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { GroupMenu, LibraryControlRow, SortMenu } from "@/components/appshell/ViewMenus";
import { EmptyState } from "@/components/EmptyState";
import { type Shelf, type ShelfGrouping, type ShelfItem, type ShelfWatchState } from "@/lib/api";
import type { AppRequests } from "@/lib/memberTarget";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { narrowFolders, normalizeFolder } from "@/components/appshell/folders";
import { useFolderChips } from "@/components/appshell/useFolderChips";
import { SORT_CHOICES, VIDEO_GROUPS, shelfTitle, type SortId, type VideoGroup } from "./labels";
import { videoShelfHref, type ShelfLinkConditions } from "./shelfLinks";
import { isViewerRequired } from "./useVideoApp";
import { VideoCard } from "./VideoCard";
import { VideoPagedGrid } from "./VideoPagedGrid";

export const LIBRARY_SHELF_ITEMS = 5;
export const LIBRARY_SHELVES_PER_PAGE = 12;
export const LIBRARY_NONE_PAGE_SIZE = 60;

const WATCH_STATES: readonly ShelfWatchState[] = ["unwatched", "in_progress", "finished"];
const noop = () => {};

export function seeAllHref(
  drive: string,
  by: ShelfGrouping,
  key: string,
  sortId?: SortId,
  conditions: ShelfLinkConditions = {},
): string {
  return videoShelfHref(drive, by, key, sortId, "library", conditions);
}

function listOf(value: string | readonly string[] | undefined): string[] {
  return value === undefined ? [] : ([value].flat() as string[]);
}

/** The chips of the target under the position, never the face's own conditions. */
function useVideoFolderChips(
  drive: string,
  params: VideoTargetParams | null,
  folders: readonly string[],
  enabled: boolean,
  requests: AppRequests,
) {
  const loadPage = useMemo(
    () =>
      params === null || !enabled
        ? null
        : (offset: number) =>
            requests.shelves(drive, {
              ...params,
              ...(folders.length > 0 ? { folder: folders } : {}),
              by: "folder",
              per_shelf: 1,
              shelf_limit: 24,
              ...(offset > 0 ? { offset } : {}),
            }),
    [drive, params, folders, enabled, requests],
  );
  return useFolderChips(loadPage);
}

export function LibraryFace({
  drive,
  params,
  requests,
  empty,
  group,
  hasProfile,
  position = null,
  sortId,
  libraryPath = `/drive/${encodeURIComponent(drive)}/apps/video`,
  onChooseFolder = noop,
  onGroup,
  onSort,
  onViewerRejected,
}: {
  drive: string;
  params: VideoTargetParams | null;
  requests: AppRequests;
  empty: boolean;
  group: VideoGroup;
  hasProfile: boolean;
  /** The folder the URL holds; `null` at the top of the target. */
  position?: string | null;
  sortId: SortId;
  /** The Library's own URL, without a query. */
  libraryPath?: string;
  onChooseFolder?: (folder: string | null) => void;
  onGroup: (value: VideoGroup) => void;
  onSort: (value: SortId) => void;
  onViewerRejected: () => void;
}) {
  const t = useTranslations("videoApp");
  const tFilters = useTranslations("appFilters");
  const locale = useLocale();
  const sort = SORT_CHOICES.find((choice) => choice.id === sortId) ?? SORT_CHOICES[0];
  const none = group === "all";
  const filters = useLibraryFilters("video", drive, hasProfile);
  const name = filters.name;
  const watch = hasProfile && filters.state !== "all" ? (filters.state as ShelfWatchState) : undefined;

  const targetFolders = useMemo(
    () => listOf(params?.folder).map(normalizeFolder),
    [params],
  );
  const folders = useMemo(
    () =>
      params === null
        ? []
        : position === null
          ? targetFolders
          : narrowFolders(targetFolders, position),
    [params, position, targetFolders],
  );
  const blocked = empty || (position !== null && folders.length === 0);
  const chips = useVideoFolderChips(drive, params, folders, !empty && !blocked, requests);
  const chipsBase = blocked ? "" : chips.state.base;

  const query = useMemo<VideoTargetParams | null>(() => {
    if (params === null) return null;
    const merged = mergeLibraryTags(listOf(params.tag), filters.tags);
    return {
      ...params,
      ...(folders.length > 0 ? { folder: folders } : {}),
      ...(merged.length > 0 ? { tag: merged } : {}),
      ...(watch ? { watch } : {}),
      ...(name ? { search: name } : {}),
    };
  }, [params, folders, filters.tags, name, watch]);
  const excludedTags = useMemo(() => listOf(params?.tag), [params]);
  const conditionsKey = useMemo(() => JSON.stringify(query ?? null), [query]);
  const loadCandidates = useCallback(
    (signal: AbortSignal) =>
      query === null || blocked
        ? Promise.resolve([])
        : requests.tagCounts(drive, query, { signal }),
    [drive, query, requests, blocked],
  );
  const filtersActive = filters.tags.length > 0 || watch !== undefined || name !== "";

  const lists = useCardFileLists();
  const removedBefore = useRef(0);

  const fetchGrouped = useMemo(
    () =>
      query === null || none || blocked
        ? null
        : (page: number) =>
            requests
              .shelves(drive, {
                ...query,
                by: group,
                sort: sort.sort,
                order: sort.order,
                per_shelf: LIBRARY_SHELF_ITEMS,
                shelf_limit: LIBRARY_SHELVES_PER_PAGE,
                ...(page > 1 ? { offset: (page - 1) * LIBRARY_SHELVES_PER_PAGE } : {}),
              })
              .then(
                (response) => ({ items: response.shelves, total: response.total_shelves }),
                (error: unknown) => {
                  if (isViewerRequired(error)) onViewerRejected();
                  throw error;
                },
              ),
    [drive, query, requests, none, blocked, group, sort.sort, sort.order, onViewerRejected],
  );
  const shelves = usePaged<Shelf>(fetchGrouped, lists.version);
  const sentinel = useNearEnd(shelves.hasMore && shelves.more === "idle", shelves.loadMore);

  const fetchFlat = useMemo(
    () =>
      query === null || !none || blocked
        ? null
        : (page: number) =>
            fetchAlignedPage<ShelfItem>(page, removedBefore.current, LIBRARY_NONE_PAGE_SIZE, (n) =>
              requests
                .shelves(drive, {
                  ...query,
                  by: "all",
                  key: "all",
                  sort: sort.sort,
                  order: sort.order,
                  per_shelf: LIBRARY_NONE_PAGE_SIZE,
                  page: n,
                })
                .then(
                  (response) => {
                    const shelf = response.shelves[0];
                    return { items: shelf?.items ?? [], total: shelf?.count ?? 0 };
                  },
                  (error: unknown) => {
                    if (isViewerRequired(error)) onViewerRejected();
                    throw error;
                  },
                ),
            ),
    [drive, query, requests, none, blocked, sort.sort, sort.order, onViewerRejected],
  );
  const flat = usePaged(fetchFlat, lists.version);
  removedBefore.current = lists.removedCount("grid", flat.items);
  const flatItems = lists.filter("grid", flat.items);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const groupOptions = VIDEO_GROUPS.map((candidate) => ({
    value: candidate,
    label: t(`classifications.${candidate}`),
  }));
  const sortOptions = SORT_CHOICES.map((choice) => ({
    value: choice.id,
    label: t(choice.labelKey),
  }));
  const stateOptions = [
    { value: "all", label: t("state.all") },
    ...WATCH_STATES.map((value) => ({ value, label: t(`state.${value}`) })),
  ];
  const conditions: ShelfLinkConditions = {
    ...(position !== null && folders.length > 0 ? { folder: folders } : {}),
    ...(position !== null ? { fromFolder: position } : {}),
    ...(filters.tags.length > 0 ? { tag: filters.tags } : {}),
    ...(watch ? { watch } : {}),
    ...(name ? { name } : {}),
  };
  const filteredEmpty = <EmptyState icon={Search} title={tFilters("filterEmpty")} />;

  const libraryHref = (folder: string | null) =>
    folder === null ? libraryPath : `${libraryPath}?folder=${encodeURIComponent(folder)}`;

  return (
    <div className="space-y-6">
      {!empty && params !== null && (
        <div className="space-y-3 pointer-coarse:mb-3 pointer-coarse:space-y-1">
          <FolderPositionRows
            position={position}
            targetFolders={targetFolders}
            base={chipsBase}
            chips={chips.state.chips}
            chipsStatus={chips.state.status}
            chipsError={chips.state.error}
            onRetry={chips.retry}
            href={libraryHref}
            onChoose={onChooseFolder}
          />
        </div>
      )}

      <LibraryControlRow
        filters={
          <FilterMenus
            tags={filters.tags}
            onToggle={filters.toggleTag}
            onClear={filters.clearTags}
            loadCandidates={loadCandidates}
            conditionsKey={conditionsKey}
            excludeTags={excludedTags}
            state={
              hasProfile
                ? { options: stateOptions, value: filters.state, onChange: filters.setState }
                : null
            }
            onViewerRejected={onViewerRejected}
          />
        }
      >
        <GroupMenu options={groupOptions} value={group} onChange={onGroup} />
        <SortMenu options={sortOptions} value={sortId} onChange={onSort} />
      </LibraryControlRow>

      <div>
        {none ? (
          <VideoPagedGrid
            paged={{ ...flat, items: flatItems }}
            empty={empty || blocked}
            filtered={filtersActive}
            listKey="grid"
          />
        ) : blocked || empty ? (
          <EmptyState variant="no-files" />
        ) : shelves.phase === "ready" && shelves.items.length === 0 ? (
          filtersActive ? filteredEmpty : <EmptyState variant="no-files" />
        ) : shelves.phase === "failed" ? (
          <RetryButton onRetry={shelves.retry} />
        ) : shelves.phase === "ready" ? (
          <>
            <div className="space-y-10">
              {shelves.items.map((shelf) => (
                <VideoGroupShelf
                  key={shelf.key}
                  shelf={shelf}
                  title={shelfTitle({ by: group, shelf, drive, locale, t: (key) => t(key) })}
                  seeAllHref={seeAllHref(drive, group, shelf.key, sortId, conditions)}
                  onRetry={shelves.retry}
                  formatCount={number.format}
                />
              ))}
            </div>
            <div ref={sentinel} aria-hidden="true" className="h-px" />
            {shelves.more === "loading" && (
              <div className="mt-10">
                <ShelfBlock
                  title=""
                  view={{ status: "loading" }}
                  onRetry={shelves.loadMore}
                  renderItem={() => null}
                />
              </div>
            )}
            {shelves.more === "failed" && (
              <div className="mt-10">
                <RetryButton onRetry={shelves.loadMore} />
              </div>
            )}
          </>
        ) : (
          <ShelfBlock
            title=""
            view={{ status: "loading" }}
            onRetry={shelves.retry}
            renderItem={() => null}
          />
        )}
      </div>
    </div>
  );
}

function VideoGroupShelf({
  shelf,
  title,
  seeAllHref,
  onRetry,
  formatCount,
}: {
  shelf: Shelf;
  title: string;
  seeAllHref: string;
  onRetry: () => void;
  formatCount: (value: number) => string;
}) {
  const lists = useCardFileLists();
  const listKey = `group:${shelf.key}`;
  const items = lists.filter(listKey, shelf.items);
  if (items.length === 0) return null;
  const count = shelf.count - lists.removedCount(listKey, shelf.items);

  return (
    <ShelfBlock
      title={title}
      count={formatCount(count)}
      seeAllHref={seeAllHref}
      view={{ status: "loaded", items }}
      onRetry={onRetry}
      renderItem={(item) => <VideoCard item={item} fileMenu={{ listKey }} />}
    />
  );
}
