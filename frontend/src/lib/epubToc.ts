import type { TocEntry } from "./epubReaderChannel";

export function isSelectable(entry: TocEntry): boolean {
  return entry.fraction !== null;
}

export function hasSelectable(toc: readonly TocEntry[]): boolean {
  return toc.some(isSelectable);
}

/**
 * The entry a place in the book falls in, judged by where each entry's file
 * starts. Entries that share a file share its start, so the first of them
 * stands for the whole file.
 */
function entryIndexAt(toc: readonly TocEntry[], fraction: number): number | null {
  let best: number | null = null;
  toc.forEach((entry, i) => {
    if (entry.fraction === null || entry.fraction > fraction) return;
    if (best === null || entry.fraction > (toc[best].fraction as number)) best = i;
  });
  return best;
}

export function chapterAt(toc: readonly TocEntry[], fraction: number): string | null {
  const i = entryIndexAt(toc, fraction);
  return i === null ? null : toc[i].label || null;
}

export function currentEntryIndex(
  toc: readonly TocEntry[],
  place: { fraction: number; tocIndex: number | null },
): number | null {
  if (place.tocIndex !== null && place.tocIndex < toc.length) return place.tocIndex;
  return entryIndexAt(toc, place.fraction);
}

export function chapterOf(
  toc: readonly TocEntry[],
  place: { fraction: number; tocIndex: number | null },
): string | null {
  const i = currentEntryIndex(toc, place);
  return i === null ? null : toc[i].label || null;
}

/** ~6.7 px on a 320 px track, the narrowest the bar is drawn at. */
const MARK_SPACING = 1 / 48;
const MAX_MARKS = 24;

/** Where the slider marks a chapter, from the start of the book (0–1). */
export function chapterMarks(toc: readonly TocEntry[]): number[] {
  const starts = toc
    .filter((entry) => entry.depth === 0 && entry.fraction !== null)
    .map((entry) => entry.fraction as number)
    .filter((f) => f >= MARK_SPACING && f <= 1 - MARK_SPACING)
    .sort((a, b) => a - b);
  const marks: number[] = [];
  for (const f of starts) {
    if (marks.length === 0 || f - marks[marks.length - 1] >= MARK_SPACING) marks.push(f);
  }
  return marks.length > MAX_MARKS ? [] : marks;
}
