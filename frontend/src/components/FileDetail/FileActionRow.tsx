"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Maximize2 } from "lucide-react";

import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
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
   * Drop the words beside the icons.
   *
   * For the sheet's 56px peek row, which also carries the file's name:
   * the sizing rules forbid a control row wrapping, and say to reduce
   * the number of controls rather than strip their labels — but a row
   * that has to share its width with a title is the case those rules
   * describe as "the labels are what does not fit". Nothing is removed;
   * every control keeps its accessible name.
   */
  compact?: boolean;
}

/**
 * Like, favourite, trust, the addon entries, and the overflow menu.
 *
 * One row, drawn in one of two places and never both: with the rest of
 * the file's metadata in the inspector, or in the Bottom Sheet's peek
 * row on a phone, where it is what the reader can reach without raising
 * the sheet at all.
 */
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
      className={
        compact
          ? "flex flex-shrink-0 items-center gap-0.5"
          : "mt-2 flex flex-wrap items-center gap-1"
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
      <TrustTierControl file={file} onChange={onFileChange} />
      {file.file_type === "image" && onRequestImageGallery && (
        <button
          onClick={onRequestImageGallery}
          className="rounded-lg p-2 text-text-muted hover:bg-bg-card hover:text-text-primary"
          aria-label={t("galleryMode")}
        >
          <Maximize2 size={16} />
        </button>
      )}
      {file.file_type === "video" && <CastButton mediaRef={videoRef} />}
      {/* Named for what it holds, not for where it sits: this row is
          lifted into the inspector's fixed header on a desktop and into
          the 56px peek row on a phone, so entries bring their own
          trigger and take no sizing from the host. Before the overflow
          menu, so `⋮` stays last the way it reads everywhere else. */}
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
