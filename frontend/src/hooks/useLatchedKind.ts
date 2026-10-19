"use client";

import { useState } from "react";

import type { FolderKind } from "@/types";

/**
 * Files arrive in pages, and resolving the view mode on every change means
 * the next page can restyle a listing under the reader's hands. The mode is
 * a decision about how to open a listing, so it is taken once.
 *
 * Adjusted during render rather than in an effect, so the first frame
 * that has files is already laid out for them: an effect would paint the
 * wrong layout first.
 */
export function useLatchedKind(
  at: string,
  reported: FolderKind | null,
): FolderKind | null {
  const [latched, setLatched] = useState<{ at: string; kind: FolderKind | null }>(
    { at, kind: reported },
  );

  if (latched.at !== at) {
    setLatched({ at, kind: reported });
    return reported;
  }
  if (latched.kind === null && reported !== null) {
    setLatched({ at, kind: reported });
    return reported;
  }
  return latched.kind;
}
