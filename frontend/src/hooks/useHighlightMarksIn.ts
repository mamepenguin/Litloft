"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  indexText,
  textOffsetAtPoint,
  wrapTextSegment,
} from "@/lib/findMarks";
import { findQuoteIn, normalizeSource } from "@/lib/highlightAnchor";
import type { Highlight } from "@/types";

export const HIGHLIGHT_MARK_CLASS = "highlight-mark";

export interface DrawnHighlight {
  record: Highlight;
  start: number;
  end: number;
  /** Position in the stored list, as the final tie-breaker for clicks. */
  order: number;
}

export interface HighlightMarksHandle {
  /** The newest highlight drawn under a click, or null. */
  resolveAt(
    target: Element | null,
    clientX: number,
    clientY: number,
  ): Highlight | null;
}

interface UseHighlightMarksInOptions {
  getContainer: () => HTMLElement | null;
  records: readonly Highlight[];
  /** A PDF page; omitted for text sources. */
  page?: number;
  /** Changes when the text source renders again (content, page, text layer). */
  renderKey: unknown;
}

function clearHighlightMarks(container: HTMLElement): void {
  const marks = Array.from(
    container.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT_MARK_CLASS}`),
  );
  const parents = new Set<Node>();
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parents.add(parent);
  }
  // Unwrapping leaves the text split at every mark boundary. Merging them
  // back lets the next draw cover a whole range in one mark again.
  for (const parent of parents) parent.normalize();
}

function draw(
  container: HTMLElement,
  records: readonly Highlight[],
  page: number | undefined,
): DrawnHighlight[] {
  clearHighlightMarks(container);

  const relevant = records.filter((record) =>
    page === undefined ? record.page === null : record.page === page,
  );
  if (relevant.length === 0) return [];

  const index = indexText(container);
  const source = normalizeSource(index.text);
  const ranges: DrawnHighlight[] = [];
  for (let order = 0; order < relevant.length; order += 1) {
    const record = relevant[order];
    const hit = findQuoteIn(source, {
      quote: record.quote,
      prefix: record.prefix,
      suffix: record.suffix,
    });
    if (hit) ranges.push({ record, start: hit.start, end: hit.end, order });
  }
  if (ranges.length === 0) return [];

  const boundaries = new Map<Text, Set<number>>();
  for (const entry of index.entries) {
    const length = entry.node.nodeValue?.length ?? 0;
    for (const range of ranges) {
      const from = Math.max(range.start, entry.start) - entry.start;
      const to = Math.min(range.end, entry.start + length) - entry.start;
      if (to <= from) continue;
      let points = boundaries.get(entry.node);
      if (!points) {
        points = new Set<number>();
        boundaries.set(entry.node, points);
      }
      points.add(from);
      points.add(to);
    }
  }

  for (const entry of index.entries) {
    const points = boundaries.get(entry.node);
    if (!points) continue;
    const length = entry.node.nodeValue?.length ?? 0;
    const sorted = [...points]
      .filter((point) => point > 0 && point < length)
      .sort((left, right) => left - right);

    const pieces: { node: Text; start: number; end: number }[] = [];
    let node = entry.node;
    let consumed = 0;
    for (const point of sorted) {
      if (point <= consumed) continue;
      const tail = node.splitText(point - consumed);
      pieces.push({
        node,
        start: entry.start + consumed,
        end: entry.start + point,
      });
      node = tail;
      consumed = point;
    }
    pieces.push({
      node,
      start: entry.start + consumed,
      end: entry.start + length,
    });

    for (const piece of pieces) {
      if (piece.end <= piece.start) continue;
      const covering = ranges
        .filter(
          (range) => range.start <= piece.start && piece.end <= range.end,
        )
        .sort(newestFirst);
      for (const range of covering) {
        const mark = wrapTextSegment(
          piece.node,
          0,
          piece.node.nodeValue?.length ?? 0,
          HIGHLIGHT_MARK_CLASS,
        );
        mark.dataset.highlightId = range.record.id;
      }
    }
  }

  return ranges;
}

function newestFirst(left: DrawnHighlight, right: DrawnHighlight): number {
  if (left.record.created_at !== right.record.created_at) {
    return left.record.created_at < right.record.created_at ? 1 : -1;
  }
  return right.order - left.order;
}

function isNewer(left: DrawnHighlight, right: DrawnHighlight): boolean {
  return newestFirst(left, right) < 0;
}

export function useHighlightMarksIn({
  getContainer,
  records,
  page,
  renderKey,
}: UseHighlightMarksInOptions): HighlightMarksHandle {
  const getContainerRef = useRef(getContainer);
  getContainerRef.current = getContainer;
  const rangesRef = useRef<DrawnHighlight[]>([]);

  useEffect(() => {
    const container = getContainerRef.current();
    if (!container) {
      rangesRef.current = [];
      return;
    }
    rangesRef.current = draw(container, records, page);
    return () => {
      clearHighlightMarks(container);
      rangesRef.current = [];
    };
  }, [records, page, renderKey]);

  const resolveAt = useCallback(
    (target: Element | null, clientX: number, clientY: number) => {
      const container = getContainerRef.current();
      const ranges = rangesRef.current;
      if (!container || ranges.length === 0) return null;

      const at = textOffsetAtPoint(container, clientX, clientY);
      if (at === null) {
        const mark = target?.closest<HTMLElement>(
          `mark.${HIGHLIGHT_MARK_CLASS}`,
        );
        const id = mark?.dataset.highlightId;
        return ranges.find((range) => range.record.id === id)?.record ?? null;
      }

      let winner: DrawnHighlight | null = null;
      for (const range of ranges) {
        if (at < range.start || at >= range.end) continue;
        if (!winner || isNewer(range, winner)) winner = range;
      }
      return winner?.record ?? null;
    },
    [],
  );

  return { resolveAt };
}
