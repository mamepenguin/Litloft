"use client";

import type { ReactNode, RefObject } from "react";
import { primaryMetaLine } from "@/lib/primaryMeta";
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
  isTimedMedia: boolean;
  mediaController: MediaController | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  addonSlotProps: Record<string, unknown>;
  tagChips: ReactNode;
  hoistDescription?: boolean;
}

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
  const metaLine = primaryMetaLine(file);

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
          {metaLine !== null && (
            <div className="mt-1 text-xs text-text-muted">{metaLine}</div>
          )}
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
              the sheet is resting, and this block only while it is up. */}
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
