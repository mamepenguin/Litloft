import type { FindRow } from "@/lib/fileFind";

export const FIND_MARK_CLASS = "find-mark";
export const FIND_MARK_CURRENT_CLASS = "find-mark-current";

const CONTEXT_CHARS = 20;

/**
 * ASCII-only, as the addon folds: `toLowerCase` would also fold `É` or `Ä`,
 * and the addon would then disagree with the marks.
 */
export function foldFindText(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** The Markdown and plain-text viewers show a `text` unit; a page or a section is not theirs. */
export const isTextFindRow = (row: FindRow): boolean => row.kind === "text";

export interface FindOccurrenceContext {
  /** Up to 20 letters and digits immediately before the match, as rendered. */
  before: string;
  /** The same, immediately after it. */
  after: string;
}

/** What the selection needs from a row, and all a viewer has to carry. */
export type FindMarkRow = Pick<
  FindRow,
  "kind" | "snippet" | "match_start" | "match_length" | "ordinal"
>;

const CONTEXT_CHAR = /[\p{L}\p{N}]/u;

interface ContextText {
  text: string;
  /** The context-text index of the character at each raw index, plus the end. */
  at: number[];
}

/**
 * Letters and digits only. Whitespace, punctuation and Markdown syntax are
 * dropped before the windows are taken, so the stored source and the
 * rendered text can be compared.
 */
function contextText(text: string): ContextText {
  const chars: string[] = [];
  const at = new Array<number>(text.length + 1);
  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    at[i] = chars.length;
    if (CONTEXT_CHAR.test(char)) chars.push(char);
    for (let offset = 1; offset < char.length; offset += 1) {
      at[i + offset] = chars.length;
    }
    i += char.length;
  }
  at[text.length] = chars.length;
  return { text: chars.join(""), at };
}

const SCORE_MIN = 10;

/**
 * The addon's `match_start` and `match_length` are Python string indices, so
 * they count code points; `String.prototype.slice` counts UTF-16 units.
 */
export function codePointOffsetToIndex(text: string, offset: number): number {
  let index = 0;
  let remaining = Math.max(0, offset);
  while (remaining > 0 && index < text.length) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    index += codePoint > 0xffff ? 2 : 1;
    remaining -= 1;
  }
  return index;
}

/** How many letters and digits agree, reading away from the term. */
function agreeingLetters(
  snippet: string,
  occurrence: string,
  direction: -1 | 1,
): number {
  const limit = Math.min(snippet.length, occurrence.length, CONTEXT_CHARS);
  let agree = 0;
  while (agree < limit) {
    const snippetChar =
      direction === -1
        ? snippet[snippet.length - 1 - agree]
        : snippet[agree];
    const occurrenceChar =
      direction === -1
        ? occurrence[occurrence.length - 1 - agree]
        : occurrence[agree];
    if (snippetChar !== occurrenceChar) break;
    agree += 1;
  }
  return agree;
}

/**
 * Which occurrence of the term in the rendered unit is the current one:
 * the only occurrence with the highest context score of at least 10; failing
 * that, a page row takes `ordinal` or the first, and a text row takes none.
 * Returns a 0-based index, or null when no occurrence carries the mark.
 */
export function chooseCurrentOccurrence(
  occurrences: readonly FindOccurrenceContext[],
  row: FindMarkRow,
): number | null {
  if (occurrences.length === 0) return null;

  const snippetText = foldFindText(row.snippet);
  const snippet = contextText(snippetText);
  const snippetStart =
    snippet.at[
      codePointOffsetToIndex(snippetText, Math.max(0, row.match_start))
    ] ?? snippet.text.length;
  const snippetEnd =
    snippet.at[
      codePointOffsetToIndex(
        snippetText,
        Math.max(0, row.match_start + row.match_length),
      )
    ] ?? snippetStart;
  const before = snippet.text.slice(
    Math.max(0, snippetStart - CONTEXT_CHARS),
    snippetStart,
  );
  const after = snippet.text.slice(snippetEnd, snippetEnd + CONTEXT_CHARS);

  let winner: number | null = null;
  let best = -1;
  let bestCount = 0;
  for (let i = 0; i < occurrences.length; i += 1) {
    const occurrence = occurrences[i];
    const beforeAgree = agreeingLetters(before, occurrence.before, -1);
    const afterAgree = agreeingLetters(after, occurrence.after, 1);
    let score = beforeAgree + afterAgree;
    // A row in the frontmatter's title or tags has no rendered occurrence.
    // Such a row can share a word with a body occurrence (a title and the
    // heading below it); only a full window on the one populated side keeps
    // that partial match from winning.
    if (
      occurrence.before.length === 0 &&
      before.length > 0 &&
      afterAgree < after.length
    ) {
      score = -1;
    }
    if (
      occurrence.after.length === 0 &&
      after.length > 0 &&
      beforeAgree < before.length
    ) {
      score = -1;
    }
    if (score > best) {
      best = score;
      bestCount = 1;
      winner = i;
    } else if (score === best) {
      bestCount += 1;
    }
  }
  if (winner !== null && best >= SCORE_MIN && bestCount === 1) return winner;

  if (row.kind === "page") {
    return row.ordinal >= 1 && row.ordinal <= occurrences.length
      ? row.ordinal - 1
      : 0;
  }
  return null;
}

interface TextEntry {
  node: Text;
  start: number;
}

interface TextIndex {
  /** Every text node's value, concatenated in document order. */
  text: string;
  entries: TextEntry[];
}

function indexText(container: HTMLElement): TextIndex {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const entries: TextEntry[] = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    if (textNode.parentElement?.closest("script, style")) continue;
    entries.push({ node: textNode, start: text.length });
    text += textNode.nodeValue ?? "";
  }
  return { text, entries };
}

interface Segment {
  node: Text;
  start: number;
  end: number;
}

function segmentsFor(index: TextIndex, start: number, end: number): Segment[] {
  const segments: Segment[] = [];
  for (const entry of index.entries) {
    const length = entry.node.nodeValue?.length ?? 0;
    const nodeEnd = entry.start + length;
    if (nodeEnd <= start) continue;
    if (entry.start >= end) break;
    const from = Math.max(start, entry.start) - entry.start;
    const to = Math.min(end, nodeEnd) - entry.start;
    if (to > from) segments.push({ node: entry.node, start: from, end: to });
  }
  return segments;
}

function wrap(node: Text, start: number, end: number, current: boolean): HTMLElement {
  if (end < node.length) node.splitText(end);
  const target = start > 0 ? node.splitText(start) : node;
  const mark = document.createElement("mark");
  mark.className = current ? `${FIND_MARK_CLASS} ${FIND_MARK_CURRENT_CLASS}` : FIND_MARK_CLASS;
  target.parentNode?.insertBefore(mark, target);
  mark.appendChild(target);
  return mark;
}

export function clearFindMarks(container: HTMLElement): void {
  const marks = container.querySelectorAll<HTMLElement>(`mark.${FIND_MARK_CLASS}`);
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  }
}

/**
 * Wraps every occurrence of `term` in a find mark and returns the current
 * unit occurrence's first mark, or null when there is none.
 */
export function markFindOccurrences(
  container: HTMLElement,
  term: string,
  currentRow: FindMarkRow | null,
): HTMLElement | null {
  const needle = foldFindText(term);
  if (needle.length === 0) return null;

  const index = indexText(container);
  const folded = foldFindText(index.text);
  const context = contextText(folded);
  const starts: number[] = [];
  const contexts: FindOccurrenceContext[] = [];
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    starts.push(at);
    const position = context.at[at] ?? 0;
    const end = context.at[at + needle.length] ?? context.text.length;
    contexts.push({
      before: context.text.slice(
        Math.max(0, position - CONTEXT_CHARS),
        position,
      ),
      after: context.text.slice(end, end + CONTEXT_CHARS),
    });
  }

  const current =
    currentRow === null ? null : chooseCurrentOccurrence(contexts, currentRow);

  let currentMark: HTMLElement | null = null;
  // Back to front: splitting a later occurrence leaves the offsets of an
  // earlier one in the same text node untouched.
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const at = starts[i];
    const isCurrent = i === current;
    let first: HTMLElement | null = null;
    for (const segment of segmentsFor(index, at, at + needle.length)) {
      const mark = wrap(segment.node, segment.start, segment.end, isCurrent);
      first ??= mark;
    }
    if (isCurrent) currentMark = first;
  }
  return currentMark;
}
