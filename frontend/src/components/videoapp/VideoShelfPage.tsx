"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { RetryButton } from "@/components/appshell/RetryButton";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { VideoGrid } from "@/components/appshell/VideoGrid";
import { PageFrame } from "@/components/PageFrame";
import { builtinApps } from "@/lib/builtinApps";
import { MIN_CARD_COLUMNS } from "@/lib/cardGrid";
import { getShelves, type ShelfGrouping, type ShelfItem } from "@/lib/api";
import { slotEntryLabel } from "@/lib/slotLabel";
import { SortChoiceMenu } from "./LibraryControls";
import {
  CONTINUE_SORT_CHOICES,
  SORT_CHOICES,
  parseShelfSortId,
  shelfTitle,
  type ShelfSortChoice,
} from "./labels";
import { useProviderShelfPage } from "./useProviderShelfPage";
import { isViewerRequired, useVideoApp } from "./useVideoApp";
import { VideoAppHeader } from "./VideoAppHeader";
import { VideoCard } from "./VideoCard";

export const SHELF_PAGE_SIZE = 60;

const GROUPINGS: readonly ShelfGrouping[] = ["all", "folder", "tag", "month", "duration", "watch"];

export function parseGrouping(raw: string | null): ShelfGrouping | null {
  return GROUPINGS.find((grouping) => grouping === raw) ?? null;
}

function SkeletonCard() {
  return (
    <li className="animate-pulse" aria-hidden="true">
      <div className="aspect-video rounded-2xl bg-bg-elevated" />
      <div className="mt-3 h-[1.375rem] w-3/4 rounded-lg bg-bg-elevated" />
    </li>
  );
}

function SkeletonGrid({ rows }: { rows: number }) {
  return (
    <VideoGrid>
      {(columns) =>
        Array.from({
          length: rows * (columns > 0 ? columns : MIN_CARD_COLUMNS),
        }).map((_, i) => <SkeletonCard key={i} />)
      }
    </VideoGrid>
  );
}

/** One shelf of the Library, as a grid paged 60 at a time. */
export function VideoShelfPage({
  drive,
  by,
  shelfKey,
  initialSort,
  from,
  entry,
  slot,
}: {
  drive: string;
  by: ShelfGrouping | null;
  shelfKey: string;
  initialSort?: string | null;
  from?: string | null;
  /** An addon shelf to page through its page provider. */
  entry?: string | null;
  /** Which slot `entry` belongs to; `recommended` pages Recommended's provider. */
  slot?: string | null;
}) {
  const t = useTranslations("videoApp");
  const tGlobal = useTranslations();
  const locale = useLocale();
  const state = useVideoApp(drive);
  const entryMode = typeof entry === "string" && entry !== "";
  const recommendedMode = entryMode && slot === "recommended";
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
  const { params, rejectViewer } = state;
  const fetchPage = useMemo(
    () =>
      entryMode || by === null || params === null || watchBlocked
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
    [entryMode, drive, by, shelfKey, params, watchBlocked, sort.sort, sort.order, rejectViewer],
  );
  const paged = usePaged<ShelfItem>(fetchPage);
  const provider = useProviderShelfPage({
    enabled: entryMode,
    entryId: entryMode ? entry : null,
    recommended: recommendedMode,
    nickname: state.nickname,
    hasProfile: state.hasProfile,
    drive,
    params,
    ready: state.ready,
    empty: state.empty,
    onViewerRejected: rejectViewer,
  });
  const sentinel = useNearEnd(
    entryMode ? provider.hasMore : paged.hasMore && paged.more === "idle",
    entryMode ? provider.loadMore : paged.loadMore,
  );

  const title = entryMode
    ? recommendedMode
      ? t("shelves.recommended")
      : provider.entry
        ? slotEntryLabel(provider.entry, tGlobal)
        : t("title")
    : by === null
      ? t("title")
      : shelfTitle({ by, shelf: { key: shelfKey, label: shelfKey }, drive, locale, from, t: (key) => t(key) });
  const app = builtinApps.find((candidate) => candidate.id === "video")!;

  const body = entryMode ? (
    provider.phase === "no-target" || provider.phase === "absent" ? (
      <EmptyState variant="no-files" />
    ) : provider.phase === "failed" ? (
      <RetryButton onRetry={provider.retryFirst} />
    ) : provider.phase === "ready" || provider.phase === "ended" ? (
      provider.items.length === 0 ? (
        <EmptyState variant="no-files" />
      ) : (
        <>
          <VideoGrid>
            {() =>
              provider.items.map((item) => (
                <li key={item.id} className="min-w-0">
                  <VideoCard item={item} byline={provider.bylines.get(item.id)} />
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
  ) : by === null || state.empty || watchBlocked || (paged.phase === "ready" && paged.items.length === 0) ? (
    <EmptyState variant="no-files" />
  ) : paged.phase === "failed" ? (
    <RetryButton onRetry={paged.retry} />
  ) : paged.phase === "ready" ? (
    <>
      <VideoGrid>
        {() =>
          paged.items.map((item) => (
            <li key={item.id} className="min-w-0">
              <VideoCard item={item} />
            </li>
          ))
        }
      </VideoGrid>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {paged.more === "loading" && (
        <div className="mt-8">
          <SkeletonGrid rows={1} />
        </div>
      )}
      {paged.more === "failed" && (
        <div className="mt-8">
          <RetryButton onRetry={paged.loadMore} />
        </div>
      )}
    </>
  ) : (
    <SkeletonGrid rows={2} />
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
          actions={
            entryMode ? undefined : (
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
  );
}
