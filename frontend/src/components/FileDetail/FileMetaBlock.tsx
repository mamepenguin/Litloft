"use client";

import type { ReactNode, RefObject } from "react";
import { formatDuration, formatFileSize } from "@/lib/format";
import type { MediaController } from "@/lib/mediaController";
import type { FileItem } from "@/types";
import { FileActionRow } from "./FileActionRow";
import { FileDescription } from "./FileDescription";
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
          {/* An <h2>: this heads the inspector, which is a region of the
              page, not the page. The page's own subject is named by the
              breadcrumb in FileDetailChrome, and two <h1>s naming the same
              file was the shape §3.2 was blank about. Size from §3.2 H2. */}
          <h2 className="text-lg font-bold text-text-primary">{file.title}</h2>
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
          {/* Also drawn by the sheet's peek row on a phone — in one of
              the two places, never both: the strip exists only while
              the sheet is resting, and this block only while it is up.
              Stateless triggers over the same handlers, so unlike a
              click-to-edit title there is nothing for two copies to
              disagree about. */}
          <FileActionRow
              file={file}
              onFileChange={onFileChange}
              onRefetch={onRefetch}
              onStartEdit={onStartEdit}
              onAfterDelete={onAfterDelete}
              onRequestImageGallery={onRequestImageGallery}
              videoRef={videoRef}
              addonSlotProps={addonSlotProps}
          />
          <div className="mt-3">{tagChips}</div>
        </div>
      )}
    </div>
  );
}
