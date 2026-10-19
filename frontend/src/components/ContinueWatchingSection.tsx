"use client";

import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem, WatchHistoryItem } from "@/types";
import { deleteWatchProgress } from "@/lib/api";
import { useContextMenu } from "@/hooks/useContextMenu";
import { FileCard } from "./FileCard";
import { FileContextMenu } from "./FileContextMenu";
import { SectionRow } from "./SectionRow";

interface ContinueWatchingSectionProps {
  items: WatchHistoryItem[];
  loading: boolean;
  title?: string;
  icon?: React.ReactNode;
  seeAllHref?: string;
  onRemoveItem?: (fileId: string) => void;
  // No `totalCount`: `getWatchHistory` returns a bare array and has no
  // total to pass. Declaring the prop and leaving it undefined would
  // read as "nobody got round to it".
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl overflow-hidden">
      <div className="aspect-video bg-bg-elevated" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded-lg bg-bg-elevated" />
        <div className="h-3 w-1/2 rounded-lg bg-bg-elevated" />
      </div>
    </div>
  );
}

export function ContinueWatchingSection({
  items,
  loading,
  title,
  icon,
  seeAllHref,
  onRemoveItem,
}: ContinueWatchingSectionProps) {
  const t = useTranslations("drive");
  const tc = useTranslations("common");
  const { menuState, close, handlers } = useContextMenu();
  const [target, setTarget] = useState<FileItem | null>(null);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          {icon ?? <Play size={20} className="text-text-muted" />}
          {title ?? t("continueWatching")}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-sm text-text-muted transition-colors hover:text-accent"
          >
            {tc("seeAll")}
          </Link>
        )}
      </div>

      <SectionRow>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : items.map((item) => (
              <FileCard
                key={item.id}
                file={item}
                watchProgress={item.watch_progress}
                onContextMenu={(e, f) => {
                  setTarget(f);
                  handlers.onContextMenu(e);
                }}
                onTouchStart={(e, f) => {
                  setTarget(f);
                  handlers.onTouchStart(e);
                }}
                onTouchEnd={handlers.onTouchEnd}
                onTouchMove={handlers.onTouchMove}
              />
            ))}
      </SectionRow>

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
