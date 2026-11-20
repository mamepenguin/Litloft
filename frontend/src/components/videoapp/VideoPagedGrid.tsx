"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { RetryButton } from "@/components/appshell/RetryButton";
import { useNearEnd } from "@/components/appshell/useNearEnd";
import { VideoGrid } from "@/components/appshell/VideoGrid";
import { MIN_CARD_COLUMNS } from "@/lib/cardGrid";
import type { ShelfItem } from "@/lib/api";
import type { PagedPhase } from "@/components/appshell/usePaged";
import { VideoCard } from "./VideoCard";

export function SkeletonCard() {
  return (
    <li className="animate-pulse" aria-hidden="true">
      <div className="aspect-video rounded-2xl bg-bg-elevated" />
      <div className="mt-3 h-[1.375rem] w-3/4 rounded-lg bg-bg-elevated" />
    </li>
  );
}

export function SkeletonGrid({ rows }: { rows: number }) {
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

export interface PagedGridState<T> {
  phase: PagedPhase;
  items: readonly T[];
  more: "idle" | "loading" | "failed";
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

/** One flat grid of videos paged 60 at a time, as the See all page draws it. */
export function VideoPagedGrid({
  paged,
  empty = false,
  filtered = false,
}: {
  paged: PagedGridState<ShelfItem>;
  empty?: boolean;
  filtered?: boolean;
}) {
  const t = useTranslations("appFilters");
  const sentinel = useNearEnd(paged.hasMore && paged.more === "idle", paged.loadMore);

  if (empty) {
    return <EmptyState variant="no-files" />;
  }
  if (paged.phase === "ready" && paged.items.length === 0) {
    return filtered ? (
      <EmptyState icon={Search} title={t("filterEmpty")} />
    ) : (
      <EmptyState variant="no-files" />
    );
  }
  if (paged.phase === "failed") {
    return <RetryButton onRetry={paged.retry} />;
  }
  if (paged.phase === "ready") {
    return (
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
    );
  }
  return <SkeletonGrid rows={2} />;
}
