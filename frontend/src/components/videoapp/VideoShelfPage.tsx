"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { RetryButton } from "@/components/appshell/RetryButton";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { PageFrame } from "@/components/PageFrame";
import { builtinApps } from "@/lib/builtinApps";
import { getShelves, type ShelfGrouping, type ShelfItem } from "@/lib/api";
import { SortChoiceMenu } from "./LibraryControls";
import { SORT_CHOICES, parseSortId, shelfTitle, type SortChoice } from "./labels";
import { isViewerRequired, useVideoApp } from "./useVideoApp";
import { VideoAppHeader } from "./VideoAppHeader";
import { VideoCard } from "./VideoCard";

export const SHELF_PAGE_SIZE = 60;

const GROUPINGS: readonly ShelfGrouping[] = ["all", "folder", "tag", "month", "duration", "watch"];

export function parseGrouping(raw: string | null): ShelfGrouping | null {
  return GROUPINGS.find((grouping) => grouping === raw) ?? null;
}

function SkeletonGrid() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <li key={i} className="animate-pulse">
          <div className="aspect-video rounded-2xl bg-bg-elevated" />
          <div className="mt-2 h-4 w-3/4 rounded-lg bg-bg-elevated" />
        </li>
      ))}
    </ul>
  );
}

/** One shelf of the Library, as a grid paged 60 at a time. */
export function VideoShelfPage({
  drive,
  by,
  shelfKey,
  initialSort,
  from,
}: {
  drive: string;
  by: ShelfGrouping | null;
  shelfKey: string;
  initialSort?: string | null;
  from?: string | null;
}) {
  const t = useTranslations("videoApp");
  const locale = useLocale();
  const state = useVideoApp(drive);
  const [sortId, setSortId] = useState<SortChoice["id"]>(
    () => parseSortId(initialSort ?? null) ?? "newest",
  );
  const sort = SORT_CHOICES.find((choice) => choice.id === sortId) ?? SORT_CHOICES[0];

  // Watch state reads the viewer's rows; without a profile there is no shelf to open.
  const watchBlocked = by === "watch" && !state.hasProfile;
  const { params, rejectViewer } = state;
  const fetchPage = useMemo(
    () =>
      by === null || params === null || watchBlocked
        ? null
        : (page: number) =>
            getShelves(drive, {
              ...params,
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
    [drive, by, shelfKey, params, watchBlocked, sort.sort, sort.order, rejectViewer],
  );
  const paged = usePaged<ShelfItem>(fetchPage);
  const sentinel = useNearEnd(paged.hasMore && paged.more === "idle", paged.loadMore);

  const title =
    by === null
      ? t("title")
      : shelfTitle({ by, shelf: { key: shelfKey, label: shelfKey }, drive, locale, from, t: (key) => t(key) });
  const app = builtinApps.find((candidate) => candidate.id === "video")!;

  const body =
    by === null || state.empty || watchBlocked || (paged.phase === "ready" && paged.items.length === 0) ? (
      <EmptyState variant="no-files" />
    ) : paged.phase === "failed" ? (
      <RetryButton onRetry={paged.retry} />
    ) : paged.phase === "ready" ? (
      <>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {paged.items.map((item) => (
            <li key={item.id} className="min-w-0">
              <VideoCard item={item} />
            </li>
          ))}
        </ul>
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {paged.more === "loading" && <SkeletonGrid />}
        {paged.more === "failed" && <RetryButton onRetry={paged.loadMore} />}
      </>
    ) : (
      <SkeletonGrid />
    );

  return (
    <PageFrame
      width="wide"
      header={
        <VideoAppHeader
          drive={drive}
          state={state}
          title={title}
          breadcrumb={
            <Link
              href={app.route(drive)}
              className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {t("title")}
            </Link>
          }
          actions={<SortChoiceMenu value={sortId} onChange={setSortId} />}
        />
      }
    >
      <div className="px-4 pb-6 pt-4 sm:pb-8">{body}</div>
    </PageFrame>
  );
}
