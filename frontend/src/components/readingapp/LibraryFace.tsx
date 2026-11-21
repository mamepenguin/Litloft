"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { fetchAlignedPage, useCardFileLists } from "@/components/appshell/CardFileMenu";
import { FilterMenus } from "@/components/appshell/FilterMenus";
import { mergeLibraryTags, useLibraryFilters } from "@/components/appshell/libraryFilters";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { GroupMenu, LibraryControlRow, SortMenu } from "@/components/appshell/ViewMenus";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { type Shelf, type ShelfItem, type ShelfWatchState } from "@/lib/api";
import type { AppRequests } from "@/lib/memberTarget";
import type { ReadingTargetParams } from "@/lib/readingAppTarget";
import {
  READING_GROUPS,
  SORT_CHOICES,
  folderLabel,
  shelfTitle,
  sortChoiceOf,
  type ReadingGroup,
  type SortId,
} from "./labels";
import { ReadingCard } from "./ReadingCard";
import { ReadingGrid } from "./ReadingGrid";
import { narrowFolders, normalizeFolder } from "./folders";
import { readingShelfHref } from "./shelfLinks";
import { useFolderChips } from "./useFolderChips";
import { isViewerRequired } from "./useReadingApp";

export const LIBRARY_PAGE_SIZE = 60;
export const LIBRARY_TAG_ITEMS = 12;
export const LIBRARY_TAG_SHELVES_PER_PAGE = 12;

type LibraryParams = ReadingTargetParams & { watch?: ShelfWatchState };

function listOf(value: string | readonly string[] | undefined): string[] {
  return value === undefined ? [] : ([value].flat() as string[]);
}

/** The chips of the target alone, never the face's own conditions. */
export function useLibraryChips(
  drive: string,
  params: ReadingTargetParams | null,
  requests: AppRequests,
) {
  const loadPage = useMemo(
    () =>
      params === null
        ? null
        : (offset: number) =>
            requests.shelves(drive, {
              ...params,
              by: "folder",
              per_shelf: 1,
              shelf_limit: 24,
              ...(offset > 0 ? { offset } : {}),
            }),
    [drive, params, requests],
  );
  return useFolderChips(loadPage);
}

export function LibraryFace({
  drive,
  params,
  requests,
  empty,
  hasProfile,
  group,
  sortId,
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
  group: ReadingGroup;
  sortId: SortId;
  onGroup: (value: ReadingGroup) => void;
  onSort: (value: SortId) => void;
  onViewerRejected: () => void;
}) {
  const t = useTranslations("readingApp");
  const tFilters = useTranslations("appFilters");
  const locale = useLocale();
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const sort = sortChoiceOf(sortId);
  const [chip, setChip] = useState<string>("all");
  const filters = useLibraryFilters("reading", drive, hasProfile);
  const name = filters.name;

  // A chip lasts only for the target it was chosen under.
  useEffect(() => {
    setChip("all");
  }, [params]);

  const chips = useLibraryChips(drive, params, requests);

  const folders = useMemo(() => {
    if (params === null) return undefined;
    if (chip === "all") return listOf(params.folder).map(normalizeFolder);
    return narrowFolders(listOf(params.folder), chip);
  }, [params, chip]);

  const watch =
    hasProfile && filters.state !== "all" ? (filters.state as ShelfWatchState) : undefined;

  const query = useMemo<LibraryParams | null>(() => {
    if (params === null) return null;
    const next: LibraryParams = { ...params };
    if (folders !== undefined) next.folder = folders;
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
      query === null ? Promise.resolve([]) : requests.tagCounts(drive, query, { signal }),
    [drive, query, requests],
  );
  const filtersActive = filters.tags.length > 0 || watch !== undefined || name !== "";

  const blocked = empty || (chip !== "all" && folders !== undefined && folders.length === 0);

  const lists = useCardFileLists();
  const removedBefore = useRef(0);

  const fetchFlat = useMemo(
    () =>
      query === null || blocked
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
    [drive, query, requests, blocked, sort.sort, sort.order, onViewerRejected],
  );

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

  const flat = usePaged<ShelfItem>(groupedBy === null ? fetchFlat : null, lists.version);
  removedBefore.current = lists.removedCount("grid", flat.items);
  const flatItems = lists.filter("grid", flat.items);
  const grouped = usePaged<Shelf>(groupedBy === null ? null : fetchGrouped, lists.version);
  const flatSentinel = useNearEnd(flat.hasMore && flat.more === "idle", flat.loadMore);
  const groupedSentinel = useNearEnd(
    grouped.hasMore && grouped.more === "idle",
    grouped.loadMore,
  );

  if (empty) {
    return <EmptyState icon={BookOpen} title={t("targetUnusable")} />;
  }

  const conditions = {
    ...(folders !== undefined && folders.length > 0 ? { folder: folders } : {}),
    ...(filters.tags.length > 0 ? { tag: filters.tags } : {}),
    ...(watch ? { watch } : {}),
    ...(name ? { name } : {}),
  };
  const filteredEmpty = <EmptyState icon={Search} title={tFilters("filterEmpty")} />;

  const chipRow = (
    <div
      data-testid="reading-chips"
      className="flex flex-wrap gap-2 pb-1 max-h-[8rem] overflow-y-auto pointer-coarse:max-h-none pointer-coarse:flex-nowrap pointer-coarse:overflow-x-auto"
    >
      <ChipButton label={t("all")} selected={chip === "all"} onSelect={() => setChip("all")} />
      {chips.state.chips.map((folder) => (
        <ChipButton
          key={folder.key}
          label={folder.label || folderLabel(folder.key, drive)}
          selected={chip === normalizeFolder(folder.key)}
          onSelect={() => setChip(normalizeFolder(folder.key))}
        />
      ))}
      {(chips.state.status === "failed" || chips.state.error) && (
        <div className="flex flex-shrink-0 items-center">
          <RetryButton onRetry={chips.retry} />
        </div>
      )}
    </div>
  );

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
  } else if (groupedBy === null) {
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
                title={shelfTitle({ by: groupedBy, key: shelf.key, drive, locale, t: (key) => t(key) })}
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

  return (
    <div>
      {chipRow}
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

function ChipButton({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex-shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors pointer-coarse:min-h-11 bg-bg-elevated ${
        selected
          ? "border-accent font-semibold text-text-primary"
          : "border-transparent text-text-muted hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}
