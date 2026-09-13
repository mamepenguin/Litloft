"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Maximize2 } from "lucide-react";

import type { FileItem } from "@/types";
import { AddonSlot } from "../AddonSlot";
import { CastButton } from "../CastButton";
import { FavoriteButton } from "../FavoriteButton";
import { FileActions } from "../FileActions";
import { LikeButton } from "../LikeButton";
import { TrustTierControl } from "../TrustTierControl";

export interface FileActionRowProps {
  file: FileItem;
  onFileChange: (file: FileItem) => void;
  onRefetch: () => void;
  onStartEdit: () => void;
  onAfterDelete?: () => void;
  onRequestImageGallery?: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  addonSlotProps: Record<string, unknown>;
  /**
   * Trust, Cast and the gallery launcher are not dropped but *not lifted* —
   * they live in the inspector's fixed part.
   */
  compact?: boolean;
}

export function FileActionRow({
  file,
  onFileChange,
  onRefetch,
  onStartEdit,
  onAfterDelete,
  onRequestImageGallery,
  videoRef,
  addonSlotProps,
  compact = false,
}: FileActionRowProps) {
  const t = useTranslations("file");

  return (
    <div
      data-testid="file-action-row"
      // Wraps because it also renders inside the 384px inspector. The
      // peek row is the one place it must not: there it shares a line
      // with the title, so it stays on one line and sheds its labels.
      // `pointer-coarse:min-h-11` alone was wrong here: it makes the row
      // 44px and `items-center` never stretches a child into it.
      // `file-action-row-touch` grows each control to 44px on a coarse
      // pointer instead, in CSS, because three of the four are not this
      // component's to give a class to — one is an addon's.
      className={
        compact
          ? "file-action-row-touch file-action-row-compact flex flex-shrink-0 items-center gap-0.5"
          : "file-action-row-touch mt-2 flex flex-wrap items-center gap-1"
      }
    >
      <LikeButton
        fileId={file.id}
        likedAt={file.liked_at}
        onToggle={onFileChange}
        showLabel={!compact}
      />
      <FavoriteButton
        fileId={file.id}
        isFavorite={file.is_favorite}
        onToggle={onFileChange}
        showLabel={!compact}
      />
      {!compact && <TrustTierControl file={file} onChange={onFileChange} />}
      {!compact && file.file_type === "image" && onRequestImageGallery && (
        <button
          onClick={onRequestImageGallery}
          className="rounded-lg p-2 text-text-muted hover:bg-bg-card hover:text-text-primary"
          aria-label={t("galleryMode")}
        >
          <Maximize2 size={16} />
        </button>
      )}
      {!compact && file.file_type === "video" && (
        <CastButton mediaRef={videoRef} />
      )}
      {/* Entries bring their own trigger and take no sizing from the host.
          Before the overflow menu, so `⋮` stays last as it reads everywhere. */}
      <AddonSlot
        id="file-detail-actions"
        layout="stack"
        props={addonSlotProps}
      />
      <FileActions
        file={file}
        onUpdate={onRefetch}
        onDelete={() => onAfterDelete?.()}
        onEdit={onStartEdit}
        addonProps={addonSlotProps}
      />
    </div>
  );
}
