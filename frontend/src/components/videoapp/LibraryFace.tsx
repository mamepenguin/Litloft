"use client";

import { useCallback, useMemo } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { RetryButton } from "@/components/appshell/RetryButton";
import { FilterMenus } from "@/components/appshell/FilterMenus";
import { mergeLibraryTags, useLibraryFilters } from "@/components/appshell/libraryFilters";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { GroupMenu, LibraryControlRow, SortMenu } from "@/components/appshell/ViewMenus";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { EmptyState } from "@/components/EmptyState";
import { type Shelf, type ShelfGrouping, type ShelfWatchState } from "@/lib/api";
import type { AppRequests } from "@/lib/memberTarget";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { SORT_CHOICES, VIDEO_GROUPS, shelfTitle, type SortId, type VideoGroup } from "./labels";
import { videoShelfHref, type ShelfLinkConditions } from "./shelfLinks";
import { isViewerRequired } from "./useVideoApp";
import { VideoCard } from "./VideoCard";
import { VideoPagedGrid } from "./VideoPagedGrid";

export const LIBRARY_SHELF_ITEMS = 5;
export const LIBRARY_SHELVES_PER_PAGE = 12;
export const LIBRARY_NONE_PAGE_SIZE = 60;

const WATCH_STATES: readonly ShelfWatchState[] = ["unwatched", "in_progress", "finished"];

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

export function LibraryFace({
  drive,
  params,
  requests,
  empty,
  group,
  hasProfile,
  sortId,
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
  sortId: SortId;
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
  const watch = hasProfile && filters.state !== "all" ? (filters.state as ShelfWatchState) : undefined;

  const query = useMemo<VideoTargetParams | null>(() => {
    if (params === null) return null;
    const merged = mergeLibraryTags(listOf(params.tag), filters.tags);
    return {
      ...params,
      ...(merged.length > 0 ? { tag: merged } : {}),
      ...(watch ? { watch } : {}),
    };
  }, [params, filters.tags, watch]);
  const excludedTags = useMemo(() => listOf(params?.tag), [params]);
  const conditionsKey = useMemo(() => JSON.stringify(query ?? null), [query]);
  const loadCandidates = useCallback(
    (signal: AbortSignal) =>
      query === null ? Promise.resolve([]) : requests.tagCounts(drive, query, { signal }),
    [drive, query, requests],
  );
  const filtersActive = filters.tags.length > 0 || watch !== undefined;

  const fetchGrouped = useMemo(
    () =>
      query === null || none
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
    [drive, query, requests, none, group, sort.sort, sort.order, onViewerRejected],
  );
  const shelves = usePaged<Shelf>(fetchGrouped);
  const sentinel = useNearEnd(shelves.hasMore && shelves.more === "idle", shelves.loadMore);

  const fetchFlat = useMemo(
    () =>
      query === null || !none
        ? null
        : (page: number) =>
            requests
              .shelves(drive, {
                ...query,
                by: "all",
                key: "all",
                sort: sort.sort,
                order: sort.order,
                per_shelf: LIBRARY_NONE_PAGE_SIZE,
                page,
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
    [drive, query, requests, none, sort.sort, sort.order, onViewerRejected],
  );
  const flat = usePaged(fetchFlat);

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
    ...(filters.tags.length > 0 ? { tag: filters.tags } : {}),
    ...(watch ? { watch } : {}),
  };
  const filteredEmpty = <EmptyState icon={Search} title={tFilters("filterEmpty")} />;

  return (
    <div className="space-y-6">
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
          <VideoPagedGrid paged={flat} empty={empty} filtered={filtersActive} />
        ) : empty ? (
          <EmptyState variant="no-files" />
        ) : shelves.phase === "ready" && shelves.items.length === 0 ? (
          filtersActive ? filteredEmpty : <EmptyState variant="no-files" />
        ) : shelves.phase === "failed" ? (
          <RetryButton onRetry={shelves.retry} />
        ) : shelves.phase === "ready" ? (
          <>
            <div className="space-y-10">
              {shelves.items.map((shelf) => {
                const title = shelfTitle({ by: group, shelf, drive, locale, t: (key) => t(key) });
                return (
                  <ShelfBlock
                    key={shelf.key}
                    title={title}
                    count={number.format(shelf.count)}
                    seeAllHref={seeAllHref(drive, group, shelf.key, sortId, conditions)}
                    view={{ status: "loaded", items: shelf.items }}
                    onRetry={shelves.retry}
                    renderItem={(item) => <VideoCard item={item} />}
                  />
                );
              })}
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
