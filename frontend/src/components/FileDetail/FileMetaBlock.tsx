"use client";

import type { ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";
import { Maximize2 } from "lucide-react";

import { formatDuration, formatFileSize } from "@/lib/format";
import type { MediaController } from "@/lib/mediaController";
import type { FileItem } from "@/types";
import { AddonSlot } from "../AddonSlot";
import { CastButton } from "../CastButton";
import { FavoriteButton } from "../FavoriteButton";
import { FileActions } from "../FileActions";
import { LikeButton } from "../LikeButton";
import { FileDescription } from "./FileDescription";
import { TrustTierControl } from "../TrustTierControl";
import { MetadataEditor } from "./MetadataEditor";

interface FileMetaBlockProps {
  file: FileItem;
  editing: boolean;
  editTitle: string;
  editDesc: string;
  saving: boolean;
  onEditTitleChange: (value: string) => void;
  onEditDescChange: (value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onFileChange: (file: FileItem) => void;
  onRefetch: () => void;
  onAfterDelete?: () => void;
  onRequestImageGallery?: () => void;
  /** Media with a timeline, so description timestamps are seekable. */
  isTimedMedia: boolean;
  mediaController: MediaController | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Context handed to every addon slot on this surface, unchanged. */
  addonSlotProps: Record<string, unknown>;
  /** The tag chip row, built by the container so it can pick its mode. */
  tagChips: ReactNode;
  /**
   * Leave the description out — the layout is drawing it elsewhere.
   *
   * Media on the shell does: the confirmed layout keeps the viewer and
   * the long things belonging to it in the canvas, and a description is
   * one of those. It is a flag rather than two components so there is
   * one description rendering, not a canvas copy that drifts from an
   * inspector copy.
   */
  hoistDescription?: boolean;
}

/**
 * Title, length / size, description, the per-file action row, and tags.
 *
 * One block, rendered on whichever surface the layout puts it on. That
 * is the point: this is the part of file detail that does not change
 * between a Markdown note and a video, so it is written once and placed
 * by the layout rather than rebuilt per file type.
 */
export function FileMetaBlock({
  file,
  editing,
  editTitle,
  editDesc,
  saving,
  onEditTitleChange,
  onEditDescChange,
  onSave,
  onCancelEdit,
  onStartEdit,
  onFileChange,
  onRefetch,
  onAfterDelete,
  onRequestImageGallery,
  isTimedMedia,
  mediaController,
  videoRef,
  addonSlotProps,
  tagChips,
  hoistDescription = false,
}: FileMetaBlockProps) {
  const t = useTranslations("file");
  const hasDuration = isTimedMedia && file.duration != null;

  return (
    <div className="mt-4">
      {editing ? (
        <MetadataEditor
          title={editTitle}
          description={editDesc}
          saving={saving}
          onTitleChange={onEditTitleChange}
          onDescriptionChange={onEditDescChange}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      ) : (
        <div>
          <h1 className="text-xl font-bold text-text-primary">{file.title}</h1>
          {/* One line, always. Which parts it has is a question about
              the file; whether the line exists at all is not. */}
          <div className="mt-1 text-xs text-text-muted">
            {hasDuration && <span>{formatDuration(file.duration)} · </span>}
            <span>{formatFileSize(file.file_size)}</span>
          </div>
          {!hoistDescription && (
            <FileDescription
              file={file}
              isTimedMedia={isTimedMedia}
              mediaController={mediaController}
              className="mt-1"
            />
          )}
          {/* Wraps because this row also renders inside the 384px Markdown
              inspector and on a phone, where it cannot fit on one line. */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <LikeButton
              fileId={file.id}
              likedAt={file.liked_at}
              onToggle={onFileChange}
              showLabel
            />
            <FavoriteButton
              fileId={file.id}
              isFavorite={file.is_favorite}
              onToggle={onFileChange}
              showLabel
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
            {/* Named for what it holds, not for where it sits: Phase 2
                lifts this whole row into the inspector's fixed header,
                and the same entry also has to fit the 56px Bottom Sheet
                peek row. Entries therefore bring their own trigger and
                take no sizing from the host. Sits before the overflow
                menu so `⋮` stays last, the way it reads everywhere else. */}
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
          <div className="mt-3">{tagChips}</div>
        </div>
      )}
    </div>
  );
}
