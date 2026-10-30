"use client";

import { useState } from "react";

import type { FileItem } from "@/types";
import type { PolicyState } from "@/hooks/usePolicy";
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
 * The decision waits for the policy as well as the slot list, since
 * `usePolicy` answers enabled while it loads, and then holds until the file
 * changes: a catalogue reload or a policy refetch must neither unmount an
 * editor that holds the viewer's text nor blank a viewer to the skeleton.
 */
export function usePlainTextDocument(
  file: FileItem | null,
  drive: string,
  knowledgeEditorPolicy: PolicyState,
): PlainTextDocumentDecision {
  const { loading, catalogueDrive, getSlotEntries } = useAddonSlots();
  const [settled, setSettled] = useState<{
    fileId: string;
    plainTextDocument: boolean;
  } | null>(null);

  if (!file || !isPlainTextEditCandidate(file)) {
    return { decided: true, plainTextDocument: false };
  }
  if (settled?.fileId === file.id) {
    return { decided: true, plainTextDocument: settled.plainTextDocument };
  }
  if (loading || catalogueDrive !== drive || knowledgeEditorPolicy.isLoading) {
    return { decided: false, plainTextDocument: false };
  }

  const plainTextDocument =
    knowledgeEditorPolicy.enabled &&
    isInlineKnowledgeEditorEnabled() &&
    getSlotEntries("file-detail-sections").some(
      (entry) => entry.id === "knowledge-edit",
    );
  setSettled({ fileId: file.id, plainTextDocument });
  return { decided: true, plainTextDocument };
}
