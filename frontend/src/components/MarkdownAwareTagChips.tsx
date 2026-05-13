"use client";

import { useSyncExternalStore } from "react";

import { markdownContentRegistry } from "@/lib/markdownContentRegistry";
import type { FileItem } from "@/types";

import { EditableTagChips } from "./EditableTagChips";

interface Props {
  fileId: string;
  file: FileItem;
  /**
   * Mirrors the parent's ``useDocumentLayout`` decision: when ``true``
   * AND the editor has registered an entry in
   * ``markdownContentRegistry``, the chip group runs in content-mode
   * (edits flow through the editor's shared ``content`` state).
   * Otherwise the chip group falls back to its standalone debounced
   * save path so non-Markdown files (or Markdown without an active
   * editor) still work.
   */
  documentLayoutActive: boolean;
  /**
   * Called by standalone mode after a successful save lands. The
   * parent uses this to refetch ``File.tags`` and ripple the change
   * through to sidebars / chip rows.
   */
  onTagsSaved: () => void;
  /**
   * Called by standalone mode for optimistic local UI updates while
   * the debounced save is still in flight.
   */
  onTagsChangeOptimistic: (tags: string[]) => void;
}

/**
 * Thin wrapper around ``EditableTagChips`` that owns the subscription
 * to ``markdownContentRegistry``.
 *
 * The subscription has to re-run on every editor keystroke so the
 * content-mode chip click sees the freshest source. Hosting it in
 * ``FileDetailContent`` would re-render that entire tree (and every
 * nested ``AddonSlot`` / ``InspectorPane`` section) per keystroke —
 * a measurable jank source. Pulling it down to this leaf keeps the
 * keystroke pulse local to the chip group, where it actually matters.
 */
export function MarkdownAwareTagChips({
  fileId,
  file,
  documentLayoutActive,
  onTagsSaved,
  onTagsChangeOptimistic,
}: Props) {
  // Subscribe ONLY here — keystrokes from the Editor pulse this
  // component but not the surrounding FileDetailContent tree.
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
