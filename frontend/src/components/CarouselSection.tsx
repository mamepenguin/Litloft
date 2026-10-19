"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem } from "@/types";
import { useContextMenu } from "@/hooks/useContextMenu";
import { FileCard } from "./FileCard";
import { FileContextMenu } from "./FileContextMenu";
import { SectionRow } from "./SectionRow";

interface CarouselSectionProps {
  title: string;
  icon?: React.ReactNode;
  files: FileItem[];
  loading: boolean;
  seeAllHref?: string;
  /**
   * How many files the section has in total, when the caller knows.
   *
   * The row shows only what fits, so "there is more" has to be said in
   * words — D-1's complaint was never the scroll strip itself but that
   * nothing told the reader how much was past the edge.
   */
  totalCount?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  onFileAction?: () => void;
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

export function CarouselSection({
  title,
  icon,
  files,
  loading,
  seeAllHref,
  totalCount,
  onRefresh,
  refreshing,
  onFileAction,
}: CarouselSectionProps) {
  const tc = useTranslations("common");
  const handleAfterAction = useCallback(() => {
    if (onFileAction) onFileAction();
    else if (onRefresh) onRefresh();
  }, [onFileAction, onRefresh]);
  const { menuState, close, handlers } = useContextMenu();
  const [target, setTarget] = useState<FileItem | null>(null);

  if (!loading && files.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          {icon}
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-accent disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{tc("refresh")}</span>
            </button>
          )}
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="text-sm text-text-muted transition-colors hover:text-accent"
            >
              {totalCount === undefined
                ? tc("seeAll")
                : tc("seeAllCount", { count: totalCount })}
            </Link>
          )}
        </div>
      </div>

      <SectionRow>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : files.map((file) => (
              <FileCard
                key={file.id}
                file={file}
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
        onUpdate={handleAfterAction}
      />
    </section>
  );
}
