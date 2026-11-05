"use client";

import { useEffect, useRef } from "react";

import { useFindMarks } from "@/components/FileDetail/find/FindContext";
import type { FindRow } from "@/lib/fileFind";
import {
  clearFindMarks,
  markFindOccurrences,
  type FindTextSource,
} from "@/lib/findMarks";

/**
 * Applies the find marks to the text under `getContainer`. The scroll is
 * tied to the current row, not to the render: `MarkdownPreview` resets its
 * HTML and the marks are re-applied on every render, but the reader must not
 * be pulled back to the current place each time.
 */
export function useFindMarksIn(
  getContainer: () => HTMLElement | null,
  isCurrentUnit: (row: FindRow) => boolean,
  active = true,
  textSource?: FindTextSource,
): void {
  const { term, currentRow } = useFindMarks();
  const scrolledFor = useRef<FindRow | null>(null);

  useEffect(() => {
    const container = getContainer();
    if (!container) return;
    clearFindMarks(container);
    if (!active || !term) return;

    const current = currentRow && isCurrentUnit(currentRow) ? currentRow : null;
    const shouldScroll = current !== null && scrolledFor.current !== current;
    const mark = markFindOccurrences(container, term, current, textSource);
    if (mark && shouldScroll) {
      scrolledFor.current = current;
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}
