"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { WatchHistoryItem } from "@/types";
import { FileCard } from "./FileCard";

interface ContinueWatchingSectionProps {
  items: WatchHistoryItem[];
  loading: boolean;
}

function SkeletonCard() {
  return (
    <div className="w-48 flex-shrink-0 snap-start sm:w-56">
      <div className="animate-pulse rounded-xl overflow-hidden">
        <div className="aspect-video bg-bg-elevated" />
        <div className="p-3 space-y-2">
          <div className="h-4 w-3/4 rounded bg-bg-elevated" />
          <div className="h-3 w-1/2 rounded bg-bg-elevated" />
        </div>
      </div>
    </div>
  );
}

export function ContinueWatchingSection({ items, loading }: ContinueWatchingSectionProps) {
  const t = useTranslations("drive");

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Play size={20} className="text-accent-teal" />
          {t("continueWatching")}
        </h2>
      </div>

      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide sm:-mx-0 sm:px-0">
        <div className="flex gap-3 pb-2 snap-x snap-mandatory">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : items.map((item) => (
                <div key={item.id} className="w-48 flex-shrink-0 snap-start sm:w-56">
                  <FileCard
                    file={item}
                    watchProgress={item.watch_progress}
                  />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
