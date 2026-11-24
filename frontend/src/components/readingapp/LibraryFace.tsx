"use client";

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { BookOpen, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { fetchAlignedPage, useCardFileLists } from "@/components/appshell/CardFileMenu";
import { FilterMenus } from "@/components/appshell/FilterMenus";
import { FolderPositionRows } from "@/components/appshell/FolderPositionRows";
import { mergeLibraryTags, useLibraryFilters } from "@/components/appshell/libraryFilters";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { GroupMenu, LibraryControlRow, SortMenu } from "@/components/appshell/ViewMenus";
import { type Shelf, type ShelfItem, type ShelfWatchState } from "@/lib/api";
import type { AppRequests } from "@/lib/memberTarget";
import type { ReadingTargetParams } from "@/lib/readingAppTarget";
import {
  READING_GROUPS,
  SORT_CHOICES,
  shelfTitle,
  sortChoiceOf,
  type ReadingGroup,
  type SortId,
} from "./labels";
import { ReadingCard } from "./ReadingCard";
import { ReadingGrid } from "./ReadingGrid";
import { baseShelfKey, narrowFolders, normalizeFolder } from "@/components/appshell/folders";
import { readingShelfHref } from "./shelfLinks";
import { useFolderChips } from "@/components/appshell/useFolderChips";
import { isViewerRequired } from "./useReadingApp";

export const LIBRARY_PAGE_SIZE = 60;
export const LIBRARY_TAG_ITEMS = 12;
export const LIBRARY_TAG_SHELVES_PER_PAGE = 12;

const noop = () => {};

type LibraryParams = ReadingTargetParams & { watch?: ShelfWatchState };

function listOf(value: string | readonly string[] | undefined): string[] {
  return value === undefined ? [] : ([value].flat() as string[]);
}

/** The chips of the target under the position, never the face's own conditions. */
export function useLibraryChips(
  drive: string,
  params: ReadingTargetParams | null,
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
  hasProfile,
  position = null,
  group,
  sortId,
  libraryPath = `/drive/${encodeURIComponent(drive)}/apps/reading`,
  onChooseFolder = noop,
  onGroup,
  onSort,
  onViewerRejected,
}: {
  drive: string;
  params: ReadingTargetParams | null;
  requests: AppRequests;
  /** The target intersects no book kind. */
  empty: boolean;
  hasProfile: boolean;
  /** The folder the URL holds; `null` at the top of the target. */
  position?: string | null;
  group: ReadingGroup;
  sortId: SortId;
  /** The Library's own URL, without a query. */
  libraryPath?: string;
  onChooseFolder?: (folder: string | null) => void;
  onGroup: (value: ReadingGroup) => void;
  onSort: (value: SortId) => void;
  onViewerRejected: () => void;
}) {
  const t = useTranslations("readingApp");
  const tFilters = useTranslations("appFilters");
  const locale = useLocale();
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const sort = sortChoiceOf(sortId);
  const filters = useLibraryFilters("reading", drive, hasProfile);
  const name = filters.name;

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
  const chips = useLibraryChips(drive, params, folders, !empty && !blocked, requests);
  const chipsBase = blocked ? "" : chips.state.base;

  const watch =
    hasProfile && filters.state !== "all" ? (filters.state as ShelfWatchState) : undefined;

  const query = useMemo<LibraryParams | null>(() => {
    if (params === null) return null;
    const next: LibraryParams = { ...params };
    if (folders.length > 0) next.folder = [...folders];
    const merged = mergeLibraryTags(listOf(params.tag), filters.tags);
    if (merged.length > 0) next.tag = merged;
    if (watch) next.watch = watch;
    if (name) next.search = name;
    return next;
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

  const groupedBy = group === "none" ? null : group;

  const fetchGrouped = useMemo(
    () =>
      query === null || blocked || groupedBy === null
        ? null
        : (page: number) =>
            requests
              .shelves(drive, {
                ...query,
                by: groupedBy,
                sort: sort.sort,
                order: sort.order,
                per_shelf: LIBRARY_TAG_ITEMS,
                shelf_limit: LIBRARY_TAG_SHELVES_PER_PAGE,
                ...(page > 1 ? { offset: (page - 1) * LIBRARY_TAG_SHELVES_PER_PAGE } : {}),
              })
              .then(
                (response) => ({ items: response.shelves, total: response.total_shelves }),
                (error: unknown) => {
                  if (isViewerRequired(error)) onViewerRejected();
                  throw error;
                },
              ),
    [drive, query, requests, blocked, groupedBy, sort.sort, sort.order, onViewerRejected],
  );

  const grouped = usePaged<Shelf>(groupedBy === null ? null : fetchGrouped, lists.version);
  const showGrid = groupedBy === null || (grouped.phase === "ready" && grouped.total === 1);
  const thisFolderKey =
    group === "folder" && chips.state.status === "ready" ? baseShelfKey(chips.state.base) : null;

  const fetchFlat = useMemo(
    () =>
      query === null || !showGrid || blocked
        ? null
        : (page: number) =>
            fetchAlignedPage<ShelfItem>(page, removedBefore.current, LIBRARY_PAGE_SIZE, (n) =>
              requests
                .shelves(drive, {
                  ...query,
                  by: "all",
                  key: "all",
                  sort: sort.sort,
                  order: sort.order,
                  per_shelf: LIBRARY_PAGE_SIZE,
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
    [drive, query, requests, showGrid, blocked, sort.sort, sort.order, onViewerRejected],
  );

  const flat = usePaged<ShelfItem>(fetchFlat, lists.version);
  removedBefore.current = lists.removedCount("grid", flat.items);
  const flatItems = lists.filter("grid", flat.items);
  const flatSentinel = useNearEnd(showGrid && flat.hasMore && flat.more === "idle", flat.loadMore);
  const groupedSentinel = useNearEnd(
    !showGrid && grouped.hasMore && grouped.more === "idle",
    grouped.loadMore,
  );

  if (empty) {
    return <EmptyState icon={BookOpen} title={t("targetUnusable")} />;
  }

  const conditions = {
    ...(position !== null && folders.length > 0 ? { folder: folders } : {}),
    ...(position !== null ? { fromFolder: position } : {}),
    ...(filters.tags.length > 0 ? { tag: filters.tags } : {}),
    ...(watch ? { watch } : {}),
    ...(name ? { name } : {}),
  };
  const filteredEmpty = <EmptyState icon={Search} title={tFilters("filterEmpty")} />;

  const groupOptions = READING_GROUPS.map((candidate) => ({
    value: candidate,
    label: t(`group.${candidate}`),
  }));
  const sortOptions = SORT_CHOICES.map((choice) => ({
    value: choice.id,
    label: t(choice.labelKey),
  }));

  const stateOptions = [
    { value: "all", label: t("state.all") },
    ...(["unwatched", "in_progress", "finished"] as const).map((value) => ({
      value,
      label: t(`state.${value}`),
    })),
  ];

  const controls = (
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
  );

  let body: ReactNode;
  if (blocked) {
    body = <EmptyState icon={BookOpen} title={t("noBooks")} />;
  } else if (
    groupedBy === null ||
    (grouped.phase === "ready" && grouped.total === 1)
  ) {
    if (flat.phase === "failed") {
      body = <RetryButton onRetry={flat.retry} />;
    } else if (flat.phase === "ready") {
      body =
        flatItems.length === 0 ? (
          filtersActive ? (
            filteredEmpty
          ) : (
            <EmptyState icon={BookOpen} title={t("noBooks")} />
          )
        ) : (
          <>
            <ReadingGrid
              items={flatItems}
              renderItem={(item) => (
                <ReadingCard item={item} drive={drive} fileMenu={{ listKey: "grid" }} />
              )}
            />
            <div ref={flatSentinel} aria-hidden="true" className="h-px" />
            {flat.more === "loading" && (
              <div className="mt-10">
                <ShelfBlock
                  title=""
                  view={{ status: "loading" }}
                  onRetry={flat.loadMore}
                  book
                  renderItem={() => null}
                />
              </div>
            )}
            {flat.more === "failed" && (
              <div className="mt-10">
                <RetryButton onRetry={flat.loadMore} />
              </div>
            )}
          </>
        );
    } else {
      body = (
        <ShelfBlock
          title=""
          view={{ status: "loading" }}
          onRetry={flat.retry}
          book
          renderItem={() => null}
        />
      );
    }
  } else if (grouped.phase === "failed") {
    body = <RetryButton onRetry={grouped.retry} />;
  } else if (grouped.phase === "ready") {
    body =
      grouped.items.length === 0 ? (
        filtersActive ? (
          filteredEmpty
        ) : (
          <EmptyState icon={BookOpen} title={t("noBooks")} />
        )
      ) : (
        <>
          <div className="space-y-10">
            {grouped.items.map((shelf) => (
              <ReadingGroupShelf
                key={shelf.key}
                shelf={shelf}
                title={
                  groupedBy === "folder" &&
                  thisFolderKey !== null &&
                  shelf.key === thisFolderKey
                    ? t("shelves.thisFolder")
                    : shelfTitle({ by: groupedBy, key: shelf.key, drive, locale, t: (key) => t(key) })
                }
                seeAllHref={readingShelfHref(drive, groupedBy, shelf.key, sortId, conditions, "library")}
                onRetry={grouped.retry}
                formatCount={number.format}
              />
            ))}
          </div>
          <div ref={groupedSentinel} aria-hidden="true" className="h-px" />
          {grouped.more === "loading" && (
            <div className="mt-10">
              <ShelfBlock
                title=""
                view={{ status: "loading" }}
                onRetry={grouped.loadMore}
                book
                renderItem={() => null}
              />
            </div>
          )}
          {grouped.more === "failed" && (
            <div className="mt-10">
              <RetryButton onRetry={grouped.loadMore} />
            </div>
          )}
        </>
      );
  } else {
    body = (
      <ShelfBlock
        title=""
        view={{ status: "loading" }}
        onRetry={grouped.retry}
        book
        renderItem={() => null}
      />
    );
  }

  const libraryHref = (folder: string | null) =>
    folder === null ? libraryPath : `${libraryPath}?folder=${encodeURIComponent(folder)}`;

  return (
    <div>
      <div className="space-y-3 pointer-coarse:space-y-1">
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
      <div className="mt-3">{controls}</div>
      <div className="mt-6">{body}</div>
    </div>
  );
}

function ReadingGroupShelf({
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
      book
      renderItem={(item) => (
        <ReadingCard item={item} drive={item.drive} fileMenu={{ listKey }} />
      )}
    />
  );
}
