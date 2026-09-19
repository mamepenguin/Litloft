"use client";

import { useTranslations } from "next-intl";

import { FileDetailShell } from "../FileDetailShell";
import { Skeleton } from "../ui/Skeleton";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { FileDetailSurface } from "@/lib/fileDetailShell";

interface FileDetailSkeletonProps {
  drive: string;
  surface: FileDetailSurface;
  onBack?: () => void;
  onScrollRootChange?: (node: HTMLElement | null) => void;
  resetKey: string;
}

function InspectorSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-6 w-4/5" />
      <Skeleton className="h-6 w-3/5" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-8" />
      </div>
      <Skeleton className="h-4 w-24" />
      <div className="flex gap-4 border-b border-bg-border pb-2">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

function CanvasSkeleton() {
  return (
    <div className="media-detail-host w-full space-y-4 p-4">
      <div className="media-detail-player" data-framed="true">
        <Skeleton className="aspect-video w-full md:rounded-xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
    </div>
  );
}

/**
 * The file view before anything about the file is known, laid out in the
 * shell the media view uses so the page does not move when it arrives.
 */
export function FileDetailSkeleton({
  drive,
  surface,
  onBack,
  onScrollRootChange,
  resetKey,
}: FileDetailSkeletonProps) {
  const isMobile = useIsMobile();
  const t = useTranslations("common");

  if (surface !== "canonical") {
    return (
      <div role="status" aria-label={t("loading")} data-testid="file-detail-skeleton">
        <CanvasSkeleton />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={t("loading")}
      data-testid="file-detail-skeleton"
      className="contents"
    >
      <FileDetailShell
        drive={drive}
        title=""
        onBack={onBack}
        onScrollRootChange={onScrollRootChange}
        inspector={<InspectorSkeleton />}
        mobileSheet={isMobile ? <InspectorSkeleton /> : undefined}
        sheetPeek={isMobile ? <Skeleton className="h-4 w-2/3" /> : undefined}
        resetKey={resetKey}
      >
        <CanvasSkeleton />
      </FileDetailShell>
    </div>
  );
}
