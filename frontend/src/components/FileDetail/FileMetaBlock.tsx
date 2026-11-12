"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useState } from "react";
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
  /**
   * The block is the top of the inspector's Info tab, so it ends with the
   * rule that separates it from the sections below.
   */
  inspector?: boolean;
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
  inspector = false,
}: FileMetaBlockProps) {
  const metaLine = primaryMetaLine(file);
  // Above the swap to the editor, so saving an edit keeps the description
  // expanded. A new file or a new mount starts collapsed.
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  useEffect(() => {
    setDescriptionExpanded(false);
  }, [file.id]);

  return (
    <div
      data-inspector-header-block={inspector ? "" : undefined}
      className={inspector ? undefined : "mt-4"}
    >
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
        <div data-inspector-header-body={inspector ? "" : undefined}>
          <h1
            data-inspector-header-title={inspector ? "" : undefined}
            className="text-xl font-bold text-text-primary"
          >
            {file.title}
          </h1>
          {metaLine !== null && (
            <div
              data-inspector-header-meta={inspector ? "" : undefined}
              className={`${inspector ? "mt-0.5" : "mt-1"} text-xs text-text-muted`}
            >
              {metaLine}
            </div>
          )}
          <FileDescription
            file={file}
            isTimedMedia={isTimedMedia}
            mediaController={mediaController}
            className="mt-1"
            inspector={inspector}
            expanded={descriptionExpanded}
            onToggleExpanded={() => setDescriptionExpanded((value) => !value)}
          />
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
          <div
            data-inspector-header-tags={inspector ? "" : undefined}
            className={inspector ? undefined : "mt-3"}
          >
            {tagChips}
          </div>
        </div>
      )}
      {inspector && (
        <div
          data-inspector-header-rule=""
          aria-hidden="true"
          className="mt-2 border-t border-bg-border pt-1"
        />
      )}
    </div>
  );
}
