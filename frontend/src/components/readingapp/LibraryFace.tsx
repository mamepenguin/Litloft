"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { getShelves, type Shelf, type ShelfItem, type ShelfWatchState } from "@/lib/api";
import type { ReadingGroup } from "@/lib/appPrefs";
import type { ReadingTargetParams } from "@/lib/readingAppTarget";
import { folderLabel, shelfTitle, sortChoiceOf, type SortChoice } from "./labels";
import { GroupMenu, ReadingSortMenu, StateMenu, TagMenu, type ReadingState } from "./LibraryControls";
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

function mergeTags(base: readonly string[], added: readonly string[]): string[] {
  const merged = [...base];
  for (const tag of added) {
    if (!merged.some((held) => held.toLowerCase() === tag.toLowerCase())) merged.push(tag);
  }
  return merged;
}

/** The chips of the target alone, never the face's own conditions. */
export function useLibraryChips(drive: string, params: ReadingTargetParams | null) {
  const loadPage = useMemo(
    () =>
      params === null
        ? null
        : (offset: number) =>
            getShelves(drive, {
              ...params,
              by: "folder",
              per_shelf: 1,
              shelf_limit: 24,
              ...(offset > 0 ? { offset } : {}),
            }),
    [drive, params],
  );
  return useFolderChips(loadPage);
}

export function LibraryFace({
  drive,
  params,
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
  /** The target intersects no book kind. */
  empty: boolean;
  hasProfile: boolean;
  group: ReadingGroup;
  sortId: SortChoice["id"];
  onGroup: (value: ReadingGroup) => void;
  onSort: (value: SortChoice["id"]) => void;
  onViewerRejected: () => void;
}) {
  const t = useTranslations("readingApp");
  const locale = useLocale();
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const sort = sortChoiceOf(sortId);
  const [chip, setChip] = useState<string>("all");
  const [tags, setTags] = useState<string[]>([]);
  const [state, setState] = useState<ReadingState>("all");

  // A chip lasts only for the target it was chosen under.
  useEffect(() => {
    setChip("all");
  }, [params]);

  // Watch state reads the viewer's rows, so losing the profile loses it.
  useEffect(() => {
    if (!hasProfile) setState("all");
  }, [hasProfile]);

  const chips = useLibraryChips(drive, params);

  const folders = useMemo(() => {
    if (params === null) return undefined;
    if (chip === "all") return listOf(params.folder).map(normalizeFolder);
    return narrowFolders(listOf(params.folder), chip);
  }, [params, chip]);

  const watch = hasProfile && state !== "all" ? state : undefined;

  const query = useMemo<LibraryParams | null>(() => {
    if (params === null) return null;
    const next: LibraryParams = { ...params };
    if (folders !== undefined) next.folder = folders;
    const merged = mergeTags(listOf(params.tag), tags);
    if (merged.length > 0) next.tag = merged;
    if (watch) next.watch = watch;
    return next;
  }, [params, folders, tags, watch]);

  const blocked = empty || (chip !== "all" && folders !== undefined && folders.length === 0);

  const fetchFlat = useMemo(
    () =>
      query === null || blocked
        ? null
        : (page: number) =>
            getShelves(drive, {
              ...query,
              by: "all",
              key: "all",
              sort: sort.sort,
              order: sort.order,
              per_shelf: LIBRARY_PAGE_SIZE,
              page,
            }).then(
              (response) => {
                const shelf = response.shelves[0];
                return { items: shelf?.items ?? [], total: shelf?.count ?? 0 };
              },
              (error: unknown) => {
                if (isViewerRequired(error)) onViewerRejected();
                throw error;
              },
            ),
    [drive, query, blocked, sort.sort, sort.order, onViewerRejected],
  );

  const fetchGrouped = useMemo(
    () =>
      query === null || blocked
        ? null
        : (page: number) =>
            getShelves(drive, {
              ...query,
              by: "tag",
              sort: sort.sort,
              order: sort.order,
              per_shelf: LIBRARY_TAG_ITEMS,
              shelf_limit: LIBRARY_TAG_SHELVES_PER_PAGE,
              ...(page > 1 ? { offset: (page - 1) * LIBRARY_TAG_SHELVES_PER_PAGE } : {}),
            }).then(
              (response) => ({ items: response.shelves, total: response.total_shelves }),
              (error: unknown) => {
                if (isViewerRequired(error)) onViewerRejected();
                throw error;
              },
            ),
    [drive, query, blocked, sort.sort, sort.order, onViewerRejected],
  );

  const flat = usePaged<ShelfItem>(group === "none" ? fetchFlat : null);
  const grouped = usePaged<Shelf>(group === "tag" ? fetchGrouped : null);
  const flatSentinel = useNearEnd(flat.hasMore && flat.more === "idle", flat.loadMore);
  const groupedSentinel = useNearEnd(
    grouped.hasMore && grouped.more === "idle",
    grouped.loadMore,
  );

  const toggleTag = (tag: string) =>
    setTags((held) => (held.includes(tag) ? held.filter((name) => name !== tag) : [...held, tag]));

  if (empty) {
    return <EmptyState icon={BookOpen} title={t("targetUnusable")} />;
  }

  const conditions = {
    ...(folders !== undefined && folders.length > 0 ? { folder: folders } : {}),
    ...(tags.length > 0 ? { tag: tags } : {}),
    ...(watch ? { watch } : {}),
  };

  const chipRow = (
    <div
      data-testid="reading-chips"
      className="flex gap-2 overflow-x-auto pb-1 [@media(hover:hover)_and_(pointer:fine)]:max-h-[8rem] [@media(hover:hover)_and_(pointer:fine)]:flex-wrap [@media(hover:hover)_and_(pointer:fine)]:overflow-x-hidden [@media(hover:hover)_and_(pointer:fine)]:overflow-y-auto"
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

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <TagMenu drive={drive} selected={tags} onToggle={toggleTag} />
      {hasProfile && <StateMenu value={state} onChange={setState} />}
      <GroupMenu value={group} onChange={onGroup} />
      <ReadingSortMenu value={sortId} onChange={onSort} />
    </div>
  );

  let body: ReactNode;
  if (blocked) {
    body = <EmptyState icon={BookOpen} title={t("noBooks")} />;
  } else if (group === "none") {
    if (flat.phase === "failed") {
      body = <RetryButton onRetry={flat.retry} />;
    } else if (flat.phase === "ready") {
      body =
        flat.items.length === 0 ? (
          <EmptyState icon={BookOpen} title={t("noBooks")} />
        ) : (
          <>
            <ReadingGrid
              items={flat.items}
              renderItem={(item) => <ReadingCard item={item} drive={drive} />}
            />
            <div ref={flatSentinel} aria-hidden="true" className="h-px" />
            {flat.more === "loading" && (
              <ShelfBlock
                title=""
                view={{ status: "loading" }}
                onRetry={flat.loadMore}
                renderItem={() => null}
              />
            )}
            {flat.more === "failed" && <RetryButton onRetry={flat.loadMore} />}
          </>
        );
    } else {
      body = (
        <ShelfBlock
          title=""
          view={{ status: "loading" }}
          onRetry={flat.retry}
          renderItem={() => null}
        />
      );
    }
  } else if (grouped.phase === "failed") {
    body = <RetryButton onRetry={grouped.retry} />;
  } else if (grouped.phase === "ready") {
    body =
      grouped.items.length === 0 ? (
        <EmptyState icon={BookOpen} title={t("noBooks")} />
      ) : (
        <>
          <div className="space-y-8">
            {grouped.items.map((shelf) => (
              <ShelfBlock
                key={shelf.key}
                title={shelfTitle({ by: "tag", key: shelf.key, drive, t: (key) => t(key) })}
                count={number.format(shelf.count)}
                seeAllHref={readingShelfHref(drive, "tag", shelf.key, sortId, conditions, "library")}
                view={{ status: "loaded", items: shelf.items }}
                onRetry={grouped.retry}
                renderItem={(item) => <ReadingCard item={item} drive={drive} />}
              />
            ))}
          </div>
          <div ref={groupedSentinel} aria-hidden="true" className="h-px" />
          {grouped.more === "loading" && (
            <ShelfBlock
              title=""
              view={{ status: "loading" }}
              onRetry={grouped.loadMore}
              renderItem={() => null}
            />
          )}
          {grouped.more === "failed" && <RetryButton onRetry={grouped.loadMore} />}
        </>
      );
  } else {
    body = (
      <ShelfBlock
        title=""
        view={{ status: "loading" }}
        onRetry={grouped.retry}
        renderItem={() => null}
      />
    );
  }

  return (
    <div className="space-y-6">
      {chipRow}
      {controls}
      {body}
    </div>
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
      className={`flex-shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors pointer-coarse:min-h-11 ${
        selected
          ? "border-accent font-semibold text-text-primary"
          : "border-bg-border text-text-muted hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}
