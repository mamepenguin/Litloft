"use client";

import { useSyncExternalStore } from "react";

import { markdownContentRegistry } from "@/lib/markdownContentRegistry";
import type { FileItem } from "@/types";

import { EditableTagChips } from "./EditableTagChips";

interface Props {
  fileId: string;
  file: FileItem;
  documentLayoutActive: boolean;
  onTagsSaved: () => void;
  onTagsChangeOptimistic: (tags: string[]) => void;
}

/**
 * The subscription re-runs on every editor keystroke. Hosting it in
 * ``FileDetailContent`` would re-render that entire tree per keystroke;
 * this leaf keeps the keystroke pulse local to the chip group.
 */
export function MarkdownAwareTagChips({
  fileId,
  file,
  documentLayoutActive,
  onTagsSaved,
  onTagsChangeOptimistic,
}: Props) {
  useSyncExternalStore(
    markdownContentRegistry.subscribe,
    () => markdownContentRegistry.lookup(fileId)?.getContent() ?? null,
    () => null,
  );
  const mdEntry = markdownContentRegistry.lookup(fileId);
  const useChipContentMode = documentLayoutActive && mdEntry !== null;

  if (useChipContentMode) {
    return (
      <EditableTagChips
        file={file}
        content={mdEntry!.getContent()}
        onContentChange={mdEntry!.setContent}
      />
    );
  }
  return (
    <EditableTagChips
      file={file}
      initialTags={file.tags}
      onTagsChange={onTagsChangeOptimistic}
      onSaveSuccess={onTagsSaved}
    />
  );
}
