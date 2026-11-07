"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { getShelves, type Shelf, type ShelfGrouping } from "@/lib/api";
import type { AppClassification } from "@/lib/appPrefs";
import type { VideoTargetParams } from "@/lib/videoAppTarget";
import { ClassificationMenu, SortChoiceMenu } from "./LibraryControls";
import { RetryButton, ShelfBlock } from "./ShelfBlock";
import { SORT_CHOICES, shelfTitle, type SortChoice } from "./labels";
import { isViewerRequired } from "./useVideoApp";
import { usePaged } from "./usePaged";
import { useNearEnd } from "./useNearEnd";

export const LIBRARY_SHELF_ITEMS = 5;
export const LIBRARY_SHELVES_PER_PAGE = 12;

/** The classification the face draws: Watch state needs a profile, the saved choice stays. */
export function effectiveClassification(
  saved: AppClassification,
  hasProfile: boolean,
): AppClassification {
  return saved === "watch" && !hasProfile ? "folder" : saved;
}

export function seeAllHref(drive: string, by: ShelfGrouping, key: string): string {
  const query = new URLSearchParams({ by, key });
  return `/drive/${encodeURIComponent(drive)}/apps/video/shelf?${query.toString()}`;
}

export function LibraryFace({
  drive,
  params,
  empty,
  savedClassification,
  hasProfile,
  sortId,
  onClassification,
  onSort,
  onViewerRejected,
}: {
  drive: string;
  params: VideoTargetParams | null;
  empty: boolean;
  /** The viewer's saved choice, which may not be offered right now. */
  savedClassification: AppClassification;
  hasProfile: boolean;
  sortId: SortChoice["id"];
  onClassification: (value: AppClassification) => void;
  onSort: (value: SortChoice["id"]) => void;
  onViewerRejected: () => void;
}) {
  const t = useTranslations("videoApp");
  const locale = useLocale();
  const by = effectiveClassification(savedClassification, hasProfile);
  const sort = SORT_CHOICES.find((choice) => choice.id === sortId) ?? SORT_CHOICES[0];

  const fetchPage = useMemo(
    () =>
      params === null
        ? null
        : (page: number) =>
            getShelves(drive, {
              ...params,
              by,
              sort: sort.sort,
              order: sort.order,
              per_shelf: LIBRARY_SHELF_ITEMS,
              shelf_limit: LIBRARY_SHELVES_PER_PAGE,
              ...(page > 1 ? { offset: (page - 1) * LIBRARY_SHELVES_PER_PAGE } : {}),
            }).then(
              (response) => ({ items: response.shelves, total: response.total_shelves }),
              (error: unknown) => {
                if (isViewerRequired(error)) onViewerRejected();
                throw error;
              },
            ),
    [drive, params, by, sort.sort, sort.order, onViewerRejected],
  );
  const shelves = usePaged<Shelf>(fetchPage);
  const sentinel = useNearEnd(shelves.hasMore && shelves.more === "idle", shelves.loadMore);
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClassificationMenu
          value={by}
          offerWatch={hasProfile}
          onChange={onClassification}
        />
        <SortChoiceMenu value={sortId} onChange={onSort} />
      </div>

      {empty || (shelves.phase === "ready" && shelves.items.length === 0) ? (
        <EmptyState variant="no-files" />
      ) : shelves.phase === "failed" ? (
        <RetryButton onRetry={shelves.retry} />
      ) : shelves.phase === "ready" ? (
        <div className="space-y-8">
          {shelves.items.map((shelf) => {
            const title = shelfTitle({ by, shelf, drive, locale, t: (key) => t(key) });
            return (
              <ShelfBlock
                key={shelf.key}
                title={title}
                count={number.format(shelf.count)}
                seeAllHref={seeAllHref(drive, by, shelf.key)}
                view={{ status: "loaded", items: shelf.items }}
                onRetry={shelves.retry}
              />
            );
          })}
          <div ref={sentinel} aria-hidden="true" className="h-px" />
          {shelves.more === "loading" && (
            <ShelfBlock title="" view={{ status: "loading" }} onRetry={shelves.loadMore} />
          )}
          {shelves.more === "failed" && <RetryButton onRetry={shelves.loadMore} />}
        </div>
      ) : (
        <ShelfBlock title="" view={{ status: "loading" }} onRetry={shelves.retry} />
      )}
    </div>
  );
}
