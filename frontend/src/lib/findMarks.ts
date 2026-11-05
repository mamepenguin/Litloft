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

/**
 * The text a text row is located in: the full source the viewer renders
 * from, and enough about it to tell a block from the frontmatter above it.
 */
export interface FindTextSource {
  text: string;
  /** The 0-based source line the rendered body starts on. */
  bodyStartLine: number;
  mode: "markdown" | "plain";
}

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

interface NormalizedText {
  /** Every whitespace run folded to one space. */
  text: string;
  /** The UTF-16 index in the original text of each normalized character. */
  toSource: number[];
}

function normalizeWhitespace(text: string): NormalizedText {
  const chars: string[] = [];
  const toSource: number[] = [];
  let previousSpace = false;
  for (let index = 0; index < text.length; ) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    if (/\s/u.test(char)) {
      if (!previousSpace) {
        chars.push(" ");
        toSource.push(index);
        previousSpace = true;
      }
    } else {
      chars.push(char);
      toSource.push(index);
      previousSpace = false;
    }
    index += char.length;
  }
  return { text: chars.join(""), toSource };
}

/** The first normalized index whose source offset reaches `sourceIndex`. */
function normalizedIndexAt(
  toSource: readonly number[],
  sourceIndex: number,
): number {
  let low = 0;
  let high = toSource.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (toSource[middle] < sourceIndex) low = middle + 1;
    else high = middle;
  }
  return low;
}

function stripEllipsis(snippet: string): { text: string; leading: number } {
  const leading = snippet.startsWith("…") ? 1 : 0;
  const trailing = snippet.endsWith("…") ? 1 : 0;
  return {
    text: snippet.slice(leading, snippet.length - trailing),
    leading,
  };
}

/** The UTF-16 offsets of every non-overlapping occurrence of `term`. */
function termStarts(text: string, term: string): number[] {
  const foldedText = foldFindText(text);
  const needle = foldFindText(term);
  if (needle.length === 0) return [];
  const starts: number[] = [];
  for (
    let at = foldedText.indexOf(needle);
    at >= 0;
    at = foldedText.indexOf(needle, at + needle.length)
  ) {
    starts.push(at);
  }
  return starts;
}

/**
 * The UTF-16 index in `source` of the term the row's snippet surrounds, or
 * null when the snippet is not there. When the snippet repeats, the
 * occurrence nearest the row's ordinal wins.
 */
export function locateTextRow(
  source: string,
  row: FindMarkRow,
): number | null {
  const stripped = stripEllipsis(row.snippet);
  if (stripped.text.length === 0) return null;
  const snippet = normalizeWhitespace(stripped.text);
  if (snippet.text.length === 0) return null;

  const matchStart = Math.max(0, row.match_start - stripped.leading);
  const matchLength = Math.max(0, row.match_length);
  const term = Array.from(stripped.text)
    .slice(matchStart, matchStart + matchLength)
    .join("");
  if (term.length === 0) return null;

  const matchIndex = normalizedIndexAt(
    snippet.toSource,
    codePointOffsetToIndex(stripped.text, matchStart),
  );
  if (matchIndex >= snippet.text.length) return null;

  const sourceText = normalizeWhitespace(source);
  const hits: number[] = [];
  for (
    let at = sourceText.text.indexOf(snippet.text);
    at >= 0;
    at = sourceText.text.indexOf(snippet.text, at + 1)
  ) {
    hits.push(at);
  }
  if (hits.length === 0) return null;

  let chosen = hits[0];
  if (hits.length > 1) {
    const positions = termStarts(source, term);
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const hit of hits) {
      const at = sourceText.toSource[hit + matchIndex];
      if (at === undefined) continue;
      let ordinal = 1;
      for (const position of positions) {
        if (position < at) ordinal += 1;
        else break;
      }
      const distance = Math.abs(ordinal - row.ordinal);
      if (distance < bestDistance) {
        bestDistance = distance;
        chosen = hit;
      }
    }
  }

  const located = sourceText.toSource[chosen + matchIndex];
  return located === undefined ? null : located;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) {
    starts.push(at + 1);
  }
  return starts;
}

function lineOf(starts: readonly number[], index: number): number {
  let low = 0;
  let high = starts.length - 1;
  let line = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= index) {
      line = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return line;
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
 * Which occurrence of the term in a PDF page's text layer is the current
 * one: the only occurrence with the highest context score of at least 10;
 * failing that, `ordinal` or the first. Returns a 0-based index, or null when
 * the unit holds no occurrence.
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
    const score =
      agreeingLetters(before, occurrence.before, -1) +
      agreeingLetters(after, occurrence.after, 1);
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

function elementTextRange(
  index: TextIndex,
  element: HTMLElement,
): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = -1;
  for (const entry of index.entries) {
    if (!element.contains(entry.node)) continue;
    start = Math.min(start, entry.start);
    end = Math.max(end, entry.start + (entry.node.nodeValue?.length ?? 0));
  }
  return end >= start ? { start, end } : null;
}

function chooseTextOccurrence(
  container: HTMLElement,
  index: TextIndex,
  starts: readonly number[],
  row: FindMarkRow,
  term: string,
  source: FindTextSource,
): number | null {
  const located = locateTextRow(source.text, row);
  if (located === null) return null;
  const startsByLine = lineStarts(source.text);
  const line = lineOf(startsByLine, located);
  if (line < source.bodyStartLine) return null;

  if (source.mode === "plain") {
    const at = starts.indexOf(located);
    return at >= 0 ? at : null;
  }

  let block: HTMLElement | null = null;
  let blockDepth = -1;
  for (const element of Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-lines]"),
  )) {
    const [from, to] = (element.dataset.sourceLines ?? "").split("-").map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (line < from || line >= to) continue;
    let depth = 0;
    for (
      let node: Element | null = element;
      node && node !== container;
      node = node.parentElement
    ) {
      depth += 1;
    }
    if (depth > blockDepth) {
      blockDepth = depth;
      block = element;
    }
  }
  if (!block) return null;

  const range = elementTextRange(index, block);
  if (!range) return null;
  const [blockStart, blockEnd] = (block.dataset.sourceLines ?? "")
    .split("-")
    .map(Number);
  const blockFrom = startsByLine[blockStart] ?? source.text.length;
  const blockTo = startsByLine[blockEnd] ?? source.text.length;

  let k = 0;
  for (const position of termStarts(source.text, term)) {
    if (position > located) break;
    if (position >= blockFrom && position < blockTo) k += 1;
  }
  if (k === 0) return null;

  const first = starts.findIndex((start) => start >= range.start);
  if (first < 0) return null;
  const current = first + k - 1;
  if (current >= starts.length || starts[current] >= range.end) return null;
  return current;
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
  textSource?: FindTextSource,
): HTMLElement | null {
  const needle = foldFindText(term);
  if (needle.length === 0) return null;

  const index = indexText(container);
  const folded = foldFindText(index.text);
  const starts: number[] = [];
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    starts.push(at);
  }

  let current: number | null = null;
  if (currentRow !== null) {
    if (currentRow.kind === "page") {
      const context = contextText(folded);
      const contexts: FindOccurrenceContext[] = starts.map((at) => {
        const position = context.at[at] ?? 0;
        const end = context.at[at + needle.length] ?? context.text.length;
        return {
          before: context.text.slice(
            Math.max(0, position - CONTEXT_CHARS),
            position,
          ),
          after: context.text.slice(end, end + CONTEXT_CHARS),
        };
      });
      current = chooseCurrentOccurrence(contexts, currentRow);
    } else if (currentRow.kind === "text" && textSource) {
      current = chooseTextOccurrence(
        container,
        index,
        starts,
        currentRow,
        needle,
        textSource,
      );
    }
  }

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
