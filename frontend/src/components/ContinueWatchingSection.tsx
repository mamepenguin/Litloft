"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem, WatchHistoryItem } from "@/types";
import { deleteWatchProgress } from "@/lib/api";
import { useContextMenu } from "@/hooks/useContextMenu";
import { FileCard } from "./FileCard";
import { FileContextMenu } from "./FileContextMenu";

interface ContinueWatchingSectionProps {
  items: WatchHistoryItem[];
  loading: boolean;
  title?: string;
  icon?: React.ReactNode;
  onRemoveItem?: (fileId: string) => void;
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

export function ContinueWatchingSection({
  items,
  loading,
  title,
  icon,
  onRemoveItem,
}: ContinueWatchingSectionProps) {
  const t = useTranslations("drive");
  const { menuState, close, handlers } = useContextMenu();
  const [target, setTarget] = useState<FileItem | null>(null);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          {icon ?? <Play size={20} className="text-accent-teal" />}
          {title ?? t("continueWatching")}
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
                    onContextMenu={(e) => {
                      setTarget(item);
                      handlers.onContextMenu(e);
                    }}
                    onTouchStart={(e) => {
                      setTarget(item);
                      handlers.onTouchStart(e);
                    }}
                    onTouchEnd={handlers.onTouchEnd}
                    onTouchMove={handlers.onTouchMove}
                  />
                </div>
              ))}
        </div>
      </div>

      <FileContextMenu
        open={menuState.open}
        position={menuState.position}
        target={target}
        onClose={close}
        onRemoveFromHistory={async () => {
          if (!target) return;
          await deleteWatchProgress(target.id);
          onRemoveItem?.(target.id);
        }}
      />
    </section>
  );
}
