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

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <TagMenu drive={drive} selected={tags} onToggle={toggleTag} />
      {hasProfile && <StateMenu value={state} onChange={setState} />}
      <GroupMenu value={group} onChange={onGroup} />
      <ReadingSortMenu value={sortId} onChange={onSort} filled />
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
        <EmptyState icon={BookOpen} title={t("noBooks")} />
      ) : (
        <>
          <div className="space-y-10">
            {grouped.items.map((shelf) => (
              <ShelfBlock
                key={shelf.key}
                title={shelfTitle({ by: "tag", key: shelf.key, drive, t: (key) => t(key) })}
                count={number.format(shelf.count)}
                seeAllHref={readingShelfHref(drive, "tag", shelf.key, sortId, conditions, "library")}
                view={{ status: "loaded", items: shelf.items }}
                onRetry={grouped.retry}
                book
                renderItem={(item) => <ReadingCard item={item} drive={drive} />}
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
