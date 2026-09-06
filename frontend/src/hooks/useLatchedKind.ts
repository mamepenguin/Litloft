"use client";

import { useState } from "react";

import type { FolderKind } from "@/types";

/**
 * The first kind a listing reported, held for as long as it is open.
 *
 * A listing's dominant kind is derived from the files loaded so far, and
 * files arrive in pages. Resolving the view mode from it on every change
 * means the next page can restyle a listing under the reader's hands: a
 * folder whose first page is mostly audio opens as a list, and a second
 * page of video turns it into a grid mid-scroll. The mode is a decision
 * about how to open a listing, so it is taken once.
 *
 * `null` does not latch — an empty first render (no files yet) has not
 * reported anything, and the first real answer is the one kept. Moving to
 * a different listing (`at`) starts over.
 *
 * Adjusted during render rather than in an effect, so the first frame
 * that has files is already laid out for them. React supports a
 * render-phase `set` on a component's own state for exactly this: it
 * re-renders before the browser paints, where an effect would paint the
 * wrong layout first — a fifty-track album flashing fifty grid cards on
 * its way to the list this rule exists to give it.
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
