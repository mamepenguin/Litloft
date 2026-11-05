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

/**
 * Which occurrence of the term in the rendered unit is the current one:
 * the context match nearest `ordinal`; failing that, a page row takes
 * `ordinal` or the first, and a text row takes none. Returns a 0-based
 * index, or null when no occurrence carries the mark.
 */
export function chooseCurrentOccurrence(
  occurrences: readonly FindOccurrenceContext[],
  row: FindMarkRow,
): number | null {
  if (occurrences.length === 0) return null;

  // The amount of context the snippet itself carries: fewer than 20 at the
  // unit's start and wherever the snippet ends. Comparing more than the
  // snippet offers would measure the stored text's tail against nothing.
  const snippet = contextText(foldFindText(row.snippet));
  const snippetStart =
    snippet.at[Math.max(0, row.match_start)] ?? snippet.text.length;
  const snippetEnd =
    snippet.at[
      Math.min(
        row.snippet.length,
        Math.max(0, row.match_start + row.match_length),
      )
    ] ?? snippetStart;
  const before = snippet.text.slice(
    Math.max(0, snippetStart - CONTEXT_CHARS),
    snippetStart,
  );
  const after = snippet.text.slice(snippetEnd, snippetEnd + CONTEXT_CHARS);

  const target = row.ordinal - 1;
  let nearest: number | null = null;
  for (let i = 0; i < occurrences.length; i += 1) {
    const occurrence = occurrences[i];
    const occurrenceBefore =
      before.length === 0
        ? ""
        : occurrence.before.slice(-before.length);
    const occurrenceAfter = occurrence.after.slice(0, after.length);
    if (occurrenceBefore !== before || occurrenceAfter !== after) continue;
    if (nearest === null || Math.abs(i - target) < Math.abs(nearest - target)) {
      nearest = i;
    }
  }
  if (nearest !== null) return nearest;

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
