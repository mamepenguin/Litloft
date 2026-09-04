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
   * The peek row's form: the four controls the design names, no labels.
   *
   * `00-basis.md` gives the strip as 題名 ＋ ♡ ☆ AI ▾ ⋮ and says to
   * reduce the *number* of controls rather than strip labels when a row
   * will not fit. Both happen here, and in that order: trust, Cast and
   * the gallery launcher are not dropped but *not lifted* — they live
   * in the inspector's fixed part, which is where the confirmed layout
   * puts the state chip. What remains then sheds its words, because it
   * is sharing a 375px line with the file's name.
   *
   * Measured: the four at 375px come to about 180px including gaps,
   * leaving the title ~155px. With trust and Cast it was ~370px and the
   * title had none.
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
      // The touch floor is on the class, not on the row's height.
      // `pointer-coarse:min-h-11` alone was wrong here: it makes the row
      // 44px and `items-center` never stretches a child into it, so the
      // targets stayed 28px inside a tall row — the case `DESIGN.md`
      // §Row Actions names when it says to give the row's own controls
      // the same treatment wherever alignment stops them inheriting it.
      // `file-action-row-compact` grows each control to 44px on a coarse
      // pointer instead, in CSS, because three of the four are not this
      // component's to give a class to — one is an addon's.
      className={
        compact
          ? "file-action-row-compact flex flex-shrink-0 items-center gap-0.5"
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
      {/* Named for what it holds, not for where it sits: this row is
          drawn in the inspector's fixed header, and on a phone with the
          sheet collapsed in the 56px strip instead — so entries bring
          their own trigger and take no sizing from the host. Before the
          overflow menu, so `⋮` stays last as it reads everywhere. */}
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
