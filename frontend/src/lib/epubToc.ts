import type { TocEntry } from "./epubReaderChannel";

/**
 * The chapter a place in the book falls in, judged by where each entry's
 * file starts. Entries that share a file share its start, so the first of
 * them stands for the whole file.
 */
export function chapterAt(toc: readonly TocEntry[], fraction: number): string | null {
  let best: TocEntry | null = null;
  for (const entry of toc) {
    if (entry.fraction === null || entry.fraction > fraction) continue;
    if (!best || entry.fraction > (best.fraction as number)) best = entry;
  }
  return best?.label || null;
}

export function chapterOf(
  toc: readonly TocEntry[],
  place: { fraction: number; tocIndex: number | null },
): string | null {
  const reported = place.tocIndex === null ? undefined : toc[place.tocIndex];
  if (reported) return reported.label || null;
  return chapterAt(toc, place.fraction);
}
