"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import {
  CardFileMenuProvider,
  pagedParams,
  useCardFileMenu,
} from "@/components/appshell/CardFileMenu";
import { NameFilter } from "@/components/appshell/NameFilter";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { usePaged } from "@/components/appshell/usePaged";
import { PageFrame } from "@/components/PageFrame";
import { type ShelfGrouping, type ShelfItem, type ShelfWatchState } from "@/lib/api";
import { isMonthKey } from "@/lib/formatMonth";
import { ReadingGrid } from "./ReadingGrid";
import {
  CONTINUE_SORT_CHOICES,
  SORT_CHOICES,
  parseShelfSortId,
  shelfTitle,
  type ShelfSortChoice,
} from "./labels";
import { ReadingSortMenu } from "./LibraryControls";
import { ReadingAppHeader } from "./ReadingAppHeader";
import { ReadingCard } from "./ReadingCard";
import type { ReadingTargetParams } from "@/lib/readingAppTarget";
import { isViewerRequired, useReadingApp } from "./useReadingApp";

export const SHELF_PAGE_SIZE = 60;

const GROUPINGS: readonly ShelfGrouping[] = ["all", "folder", "tag", "month", "watch"];
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
  name,
  onNameChange,
  onLeavePending,
  onTargetChosen,
  from,
  homeEntry,
}: {
  drive: string;
  by: ShelfGrouping | null;
  shelfKey: string;
  initialSort?: string | null;
  folders?: readonly string[];
  tags?: readonly string[];
  watch?: string | null;
  /** The URL's normalised `q`. */
  name?: string | null;
  /** An applied name; the caller replaces the URL and keeps the store. */
  onNameChange?: (name: string) => void;
  /** Called on unmount while an apply is still pending. */
  onLeavePending?: (name: string) => void;
  /** Called after a Target is chosen on this page, to drop the URL's filters. */
  onTargetChosen?: () => void;
  from?: string | null;
  /** The key of this app's Home entry. */
  homeEntry?: string;
}) {
  const t = useTranslations("readingApp");
  const tFilters = useTranslations("appFilters");
  const locale = useLocale();
  const appState = useReadingApp(drive);
  const { chooseTarget: chooseAppTarget, targetId } = appState;
  // The URL's filters stop applying in the render that shows the new Target;
  // the replace that removes them from the URL lands later.
  const urlFilters = JSON.stringify([urlTags ?? [], urlWatch ?? null, urlFolders ?? [], name ?? ""]);
  const [droppedFor, setDroppedFor] = useState<string | null>(null);
  const filtersDropped = droppedFor === urlFilters;
  const chooseTarget = useCallback(
    (id: string) => {
      if (id === targetId) return;
      setDroppedFor(urlFilters);
      chooseAppTarget(id);
      onTargetChosen?.();
    },
    [chooseAppTarget, onTargetChosen, targetId, urlFilters],
  );
  const state = useMemo(() => ({ ...appState, chooseTarget }), [appState, chooseTarget]);
  const continuePage = by === "watch" && shelfKey === "continue";
  const cards = useCardFileMenu({
    scope: JSON.stringify([
      drive,
      state.requests.key,
      state.targetId,
      state.nickname,
      state.hasProfile,
      state.params,
    ]),
    hasProfile: state.hasProfile,
    continueListKeys: continuePage ? ["page"] : [],
  });
  const removedBefore = useRef(0);
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
  const requestedWatch = filtersDropped ? null : parseWatchState(urlWatch ?? null);
  const keyValid =
    by === "folder" ||
    by === "all" ||
    (by === "watch"
      ? parseWatchState(shelfKey) !== null || shelfKey === "continue"
      : by === "month"
        ? isMonthKey(shelfKey)
        : shelfKey !== "");

  // Watch state reads the viewer's rows; without a profile there is no shelf to open.
  const watchBlocked = by === "watch" && !state.hasProfile;
  const { params, requests, rejectViewer } = state;

  const query = useMemo<ReadingTargetParams | null>(() => {
    if (params === null) return null;
    const next: ReadingTargetParams = { ...params };
    if (!filtersDropped && urlFolders && urlFolders.length > 0) next.folder = [...urlFolders];
    const merged = mergeTags(listOf(params.tag), filtersDropped ? [] : (urlTags ?? []));
    if (merged.length > 0) next.tag = merged;
    return next;
  }, [params, urlFolders, urlTags, filtersDropped]);

  const watch = state.hasProfile ? requestedWatch : null;
  const requestedName = filtersDropped ? "" : (name ?? "");
  const listing = by !== null && query !== null && keyValid && !watchBlocked;
  const filtersActive =
    !filtersDropped &&
    (requestedName !== "" ||
      (urlTags?.length ?? 0) > 0 ||
      (urlFolders?.length ?? 0) > 0 ||
      requestedWatch !== null);

  const fetchPage = useMemo(
    () =>
      by === null || query === null || watchBlocked || !keyValid
        ? null
        : (page: number) =>
            requests
              .shelves(drive, {
                ...query,
                ...(watch ? { watch } : {}),
                ...(requestedName ? { search: requestedName } : {}),
                by,
                key: shelfKey,
                sort: sort.sort,
                order: sort.order,
                per_shelf: SHELF_PAGE_SIZE,
                ...pagedParams(page, removedBefore.current, SHELF_PAGE_SIZE),
              })
              .then(
                (response) => {
                  const shelf = response.shelves[0];
                  return { items: shelf?.items ?? [], total: shelf?.count ?? 0 };
                },
                (error: unknown) => {
                  if (isViewerRequired(error)) rejectViewer();
                  throw error;
                },
              ),
    [
      drive,
      by,
      shelfKey,
      query,
      requests,
      watch,
      watchBlocked,
      keyValid,
      requestedName,
      sort.sort,
      sort.order,
      rejectViewer,
    ],
  );
  const paged = usePaged<ShelfItem>(fetchPage);
  removedBefore.current = cards.removedCount("page", paged.items);
  const pageItems = cards.filter("page", paged.items);
  const sentinel = useNearEnd(paged.hasMore && paged.more === "idle", paged.loadMore);

  const title =
    by === null
      ? t("title")
      : shelfTitle({ by, key: shelfKey, drive, locale, from, t: (key) => t(key) });

  let body: ReactNode;
  if (state.targetFailed) {
    body = <RetryButton onRetry={state.retryTarget} />;
  } else if (state.targetUnusable) {
    body = <EmptyState icon={BookOpen} title={t("targetUnusable")} />;
  } else if (state.empty) {
    body = <EmptyState icon={BookOpen} title={t("targetUnusable")} />;
  } else if (by === null || watchBlocked || !keyValid) {
    body = <EmptyState icon={BookOpen} title={t("noBooks")} />;
  } else if (paged.phase === "failed") {
    body = <RetryButton onRetry={paged.retry} />;
  } else if (paged.phase === "ready" && pageItems.length === 0) {
    body = filtersActive ? (
      <EmptyState icon={Search} title={tFilters("filterEmpty")} />
    ) : (
      <EmptyState icon={BookOpen} title={t("noBooks")} />
    );
  } else if (paged.phase === "ready") {
    body = (
      <>
        <ReadingGrid
          items={pageItems}
          renderItem={(item) => (
            <ReadingCard item={item} drive={drive} fileMenu={{ listKey: "page" }} />
          )}
        />
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {paged.more === "loading" && (
          <ShelfBlock
            title=""
            view={{ status: "loading" }}
            onRetry={paged.loadMore}
            book
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
        book
        renderItem={() => null}
      />
    );
  }

  return (
    <CardFileMenuProvider value={cards.context}>
      <PageFrame
        width="wide"
        header={
          <ReadingAppHeader
          drive={drive}
          state={state}
          title={title}
          homeEntry={homeEntry}
          breadcrumb={
            <Link
              href={`/drive/${encodeURIComponent(drive)}/apps/reading`}
              className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {t("title")}
            </Link>
          }
          actions={
            listing ? (
              <div className="flex w-full min-w-0 flex-col items-start gap-2 max-sm:pr-2 sm:w-auto md:flex-row md:items-center">
                <NameFilter
                  value={requestedName}
                  alwaysOpen
                  onApply={(next) => onNameChange?.(next)}
                  onLeavePending={onLeavePending}
                />
                <div className="shrink-0">
                  <ReadingSortMenu
                    choices={offered}
                    value={sortId}
                    quiet
                    onChange={(id) => setSelection({ scope, id })}
                  />
                </div>
              </div>
            ) : (
              <ReadingSortMenu
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
      {cards.menu}
    </CardFileMenuProvider>
  );
}
