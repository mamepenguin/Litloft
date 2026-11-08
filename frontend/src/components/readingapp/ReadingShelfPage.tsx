"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { PageFrame } from "@/components/PageFrame";
import { getShelves, type ShelfGrouping, type ShelfItem, type ShelfWatchState } from "@/lib/api";
import { ReadingGrid } from "./ReadingGrid";
import { shelfTitle, parseSortId, sortChoiceOf, type SortChoice } from "./labels";
import { ReadingSortMenu } from "./LibraryControls";
import { ReadingAppHeader } from "./ReadingAppHeader";
import { ReadingCard } from "./ReadingCard";
import type { ReadingTargetParams } from "@/lib/readingAppTarget";
import { isViewerRequired, useReadingApp } from "./useReadingApp";

export const SHELF_PAGE_SIZE = 60;

const GROUPINGS: readonly ShelfGrouping[] = ["all", "folder", "tag", "watch"];
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

function mergeTags(base: readonly string[], added: readonly string[]): string[] {
  const merged = [...base];
  for (const tag of added) {
    if (!merged.some((held) => held.toLowerCase() === tag.toLowerCase())) merged.push(tag);
  }
  return merged;
}

/** One shelf of the Library or a Discover shelf, as a grid paged 60 at a time. */
export function ReadingShelfPage({
  drive,
  by,
  shelfKey,
  initialSort,
  folders: urlFolders,
  tags: urlTags,
  watch: urlWatch,
}: {
  drive: string;
  by: ShelfGrouping | null;
  shelfKey: string;
  initialSort?: string | null;
  folders?: readonly string[];
  tags?: readonly string[];
  watch?: string | null;
}) {
  const t = useTranslations("readingApp");
  const state = useReadingApp(drive);
  const [sortId, setSortId] = useState<SortChoice["id"]>(
    () => parseSortId(initialSort ?? null) ?? "newest",
  );
  const sort = sortChoiceOf(sortId);
  const requestedWatch = parseWatchState(urlWatch ?? null);
  const keyValid =
    by === "folder" ||
    by === "all" ||
    (by === "watch" ? parseWatchState(shelfKey) !== null : shelfKey !== "");

  // Watch state reads the viewer's rows; without a profile there is no shelf to open.
  const watchBlocked = by === "watch" && !state.hasProfile;
  const { params, rejectViewer } = state;

  const query = useMemo<ReadingTargetParams | null>(() => {
    if (params === null) return null;
    const next: ReadingTargetParams = { ...params };
    if (urlFolders && urlFolders.length > 0) next.folder = [...urlFolders];
    const merged = mergeTags(listOf(params.tag), urlTags ?? []);
    if (merged.length > 0) next.tag = merged;
    return next;
  }, [params, urlFolders, urlTags]);

  const watch = state.hasProfile ? requestedWatch : null;

  const fetchPage = useMemo(
    () =>
      by === null || query === null || watchBlocked || !keyValid
        ? null
        : (page: number) =>
            getShelves(drive, {
              ...query,
              ...(watch ? { watch } : {}),
              by,
              key: shelfKey,
              sort: sort.sort,
              order: sort.order,
              per_shelf: SHELF_PAGE_SIZE,
              page,
            }).then(
              (response) => {
                const shelf = response.shelves[0];
                return { items: shelf?.items ?? [], total: shelf?.count ?? 0 };
              },
              (error: unknown) => {
                if (isViewerRequired(error)) rejectViewer();
                throw error;
              },
            ),
    [drive, by, shelfKey, query, watch, watchBlocked, keyValid, sort.sort, sort.order, rejectViewer],
  );
  const paged = usePaged<ShelfItem>(fetchPage);
  const sentinel = useNearEnd(paged.hasMore && paged.more === "idle", paged.loadMore);

  const title =
    by === null
      ? t("title")
      : shelfTitle({ by, key: shelfKey, drive, t: (key) => t(key) });

  let body: ReactNode;
  if (state.empty) {
    body = <EmptyState icon={BookOpen} title={t("targetUnusable")} />;
  } else if (by === null || watchBlocked || !keyValid) {
    body = <EmptyState icon={BookOpen} title={t("noBooks")} />;
  } else if (paged.phase === "failed") {
    body = <RetryButton onRetry={paged.retry} />;
  } else if (paged.phase === "ready" && paged.items.length === 0) {
    body = <EmptyState icon={BookOpen} title={t("noBooks")} />;
  } else if (paged.phase === "ready") {
    body = (
      <>
        <ReadingGrid
          items={paged.items}
          renderItem={(item) => <ReadingCard item={item} drive={drive} />}
        />
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {paged.more === "loading" && (
          <ShelfBlock
            title=""
            view={{ status: "loading" }}
            onRetry={paged.loadMore}
            renderItem={() => null}
          />
        )}
        {paged.more === "failed" && <RetryButton onRetry={paged.loadMore} />}
      </>
    );
  } else {
    body = (
      <ShelfBlock
        title=""
        view={{ status: "loading" }}
        onRetry={paged.retry}
        renderItem={() => null}
      />
    );
  }

  return (
    <PageFrame
      width="wide"
      header={
        <ReadingAppHeader
          drive={drive}
          state={state}
          title={title}
          breadcrumb={
            <Link
              href={`/drive/${encodeURIComponent(drive)}/apps/reading`}
              className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {t("title")}
            </Link>
          }
          actions={<ReadingSortMenu value={sortId} onChange={setSortId} />}
        />
      }
    >
      <div className="px-4 pb-6 pt-4 sm:pb-8">{body}</div>
    </PageFrame>
  );
}
