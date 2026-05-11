"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem } from "@/types";
import { useContextMenu } from "@/hooks/useContextMenu";
import { FileCard } from "./FileCard";
import { FileContextMenu } from "./FileContextMenu";

interface CarouselSectionProps {
  title: string;
  icon?: React.ReactNode;
  files: FileItem[];
  loading: boolean;
  seeAllHref?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  onFileAction?: () => void;
}

function SkeletonCard() {
  return (
    <div className="w-48 flex-shrink-0 snap-start sm:w-56">
      <div className="animate-pulse rounded-xl overflow-hidden">
        <div className="aspect-video bg-bg-elevated" />
        <div className="p-3 space-y-2">
          <div className="h-4 w-3/4 rounded-lg bg-bg-elevated" />
          <div className="h-3 w-1/2 rounded-lg bg-bg-elevated" />
        </div>
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
              {tc("seeAll")}
            </Link>
          )}
        </div>
      </div>

      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide sm:-mx-0 sm:px-0">
        <div className="flex gap-3 pb-2 snap-x snap-mandatory">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : files.map((file) => (
                <div key={file.id} className="w-48 flex-shrink-0 snap-start sm:w-56">
                  <FileCard
                    file={file}
                    onContextMenu={(e) => {
                      setTarget(file);
                      handlers.onContextMenu(e);
                    }}
                    onTouchStart={(e) => {
                      setTarget(file);
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
        onUpdate={handleAfterAction}
      />
    </section>
  );
}
