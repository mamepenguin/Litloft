import type { FileItem } from "@/types";

import type { SearchPassage, SemanticHit } from "./searchMerge";

export interface PassageGroup {
  fileId: string;
  filename: string;
  fileType: string;
  file: FileItem | null;
  bestScore: number;
  passages: SearchPassage[];
}

/**
 * Passages of the answer, one group per file that has any, ordered by the
 * file's best passage. Ties keep the order the answer gave the files.
 */
export function groupPassages(hits: readonly SemanticHit[]): PassageGroup[] {
  const groups: PassageGroup[] = [];
  for (const hit of hits) {
    const passages = hit.passages;
    if (!passages || passages.length === 0) continue;
    groups.push({
      fileId: hit.file_id,
      filename: hit.file?.filename ?? hit.filename,
      fileType: hit.file?.file_type ?? hit.file_type,
      file: hit.file ?? null,
      bestScore: passages[0].score,
      passages,
    });
  }
  return groups.sort((a, b) => b.bestScore - a.bestScore);
}

export function passageCounts(groups: readonly PassageGroup[]): {
  files: number;
  passages: number;
} {
  return {
    files: groups.length,
    passages: groups.reduce((sum, group) => sum + group.passages.length, 0),
  };
}

export type PassageLocator =
  | { kind: "timeRange"; start: number; end: number | null }
  | { kind: "timeStartOnly"; start: number }
  | { kind: "page"; page: number }
  | { kind: "section"; section: number | null; title: string | null }
  | { kind: "pictureText" }
  | { kind: "text" };

export function passageLocator(passage: SearchPassage): PassageLocator {
  switch (passage.kind) {
    case "utterance":
      return { kind: "timeRange", start: passage.start ?? 0, end: passage.end };
    case "scene":
      return { kind: "timeStartOnly", start: passage.start ?? 0 };
    case "page":
      return { kind: "page", page: passage.page ?? 0 };
    case "section":
      return {
        kind: "section",
        section: passage.section,
        title: passage.section_title,
      };
    case "picture_text":
      return { kind: "pictureText" };
    case "text":
      return { kind: "text" };
  }
}

export function passageHref(fileId: string, passage: SearchPassage): string {
  const base = `/files/${fileId}`;
  switch (passage.kind) {
    case "utterance":
    case "scene":
      return `${base}?t=${Math.floor(passage.start ?? 0)}`;
    case "page":
      return `${base}?page=${passage.page}`;
    case "section":
      return `${base}?section=${passage.section}`;
    case "picture_text":
    case "text":
      return base;
  }
}

/**
 * The longest term a keyword passage of the group matched, earliest passage
 * first on a tie. Find matches exact text, so the whole search query would
 * often open on 「見つかりません」.
 */
export function findTermForGroup(group: PassageGroup): string | null {
  let best: string | null = null;
  for (const passage of group.passages) {
    if (!passage.keyword) continue;
    for (const term of passage.highlight_terms) {
      if (term.length > 0 && (best === null || term.length > best.length)) {
        best = term;
      }
    }
  }
  return best;
}

export interface HighlightSegment {
  text: string;
  mark: boolean;
}

interface Occurrence {
  start: number;
  end: number;
}

/**
 * Splits a keyword passage's excerpt into marked and unmarked runs. Marks
 * never nest, the longest term wins where terms overlap, and equal lengths
 * fall back to the earlier occurrence.
 */
export function highlightSegments(
  text: string,
  terms: readonly string[],
): HighlightSegment[] {
  if (text === "") return [];

  const haystack = text.toLocaleLowerCase();
  const occurrences: Occurrence[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const needle = term.toLocaleLowerCase();
    if (needle === "" || seen.has(needle)) continue;
    seen.add(needle);
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      occurrences.push({ start: at, end: at + needle.length });
      at = haystack.indexOf(needle, at + 1);
    }
  }

  occurrences.sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const marked: Occurrence[] = [];
  for (const occurrence of occurrences) {
    if (
      marked.some(
        (kept) => occurrence.start < kept.end && kept.start < occurrence.end,
      )
    ) {
      continue;
    }
    marked.push(occurrence);
  }
  marked.sort((a, b) => a.start - b.start);

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const occurrence of marked) {
    if (occurrence.start > cursor) {
      segments.push({ text: text.slice(cursor, occurrence.start), mark: false });
    }
    segments.push({ text: text.slice(occurrence.start, occurrence.end), mark: true });
    cursor = occurrence.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), mark: false });
  }
  return segments;
}
