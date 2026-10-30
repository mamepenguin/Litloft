"use client";

import { useState } from "react";

import type { FileItem } from "@/types";
import { isInlineKnowledgeEditorEnabled } from "@/lib/featureFlags";
import { isPlainTextEditCandidate } from "@/lib/textKind";
import { useAddonSlots } from "../../AddonSlotsProvider";

export interface PlainTextDocumentDecision {
  /** False while a `.txt` waits on the addon slot list for its drive. */
  decided: boolean;
  plainTextDocument: boolean;
}

/**
 * The one place a `.txt` is routed to the knowledge editor.
 *
 * `knowledgeEditorEnabled` is `usePolicy(...).enabled` and never its
 * loading flag, for the reason `usesDocumentShell` gives.
 *
 * Once a file has been decided as a plain-text document it stays one until
 * the file changes: a catalogue reload or a policy refetch must not unmount
 * an editor that holds the viewer's text.
 */
export function usePlainTextDocument(
  file: FileItem | null,
  drive: string,
  knowledgeEditorEnabled: boolean,
): PlainTextDocumentDecision {
  const { loading, catalogueDrive, getSlotEntries } = useAddonSlots();
  const [stuckFileId, setStuckFileId] = useState<string | null>(null);

  if (!file || !isPlainTextEditCandidate(file)) {
    return { decided: true, plainTextDocument: false };
  }

  const slotsArrived = !loading && catalogueDrive === drive;
  const editorAvailable =
    slotsArrived &&
    knowledgeEditorEnabled &&
    isInlineKnowledgeEditorEnabled() &&
    getSlotEntries("file-detail-sections").some(
      (entry) => entry.id === "knowledge-edit",
    );

  if (editorAvailable && stuckFileId !== file.id) setStuckFileId(file.id);

  if (editorAvailable || stuckFileId === file.id) {
    return { decided: true, plainTextDocument: true };
  }
  return { decided: slotsArrived, plainTextDocument: false };
}
