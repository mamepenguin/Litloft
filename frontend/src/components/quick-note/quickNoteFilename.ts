/**
 * The note body is written to disk exactly as typed — this module never
 * removes the source line, injects a heading, or adds frontmatter.
 */

const MAX_STEM_CODE_POINTS = 80;
const MAX_STEM_BYTES = 240;

/**
 * Built with `String.fromCharCode` rather than a literal class so the
 * control-character range stays readable in source and in diffs.
 */
const UNSAFE_CHARS = new RegExp(
  `[/\\\\${String.fromCharCode(0x00)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`,
  "g",
);

const ATX_HEADING = /^#{1,6}[ \t]+/;
const BLOCKQUOTE = /^>[ \t]*/;
const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])[ \t]+/;
const TASK_CHECKBOX = /^\[[ xX]\][ \t]*/;

/** Format a Date as `YYYYMMDD-HHmmss` in browser-local time. */
function formatTimestamp(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function firstNonEmptyLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

/**
 * A task-list checkbox is only stripped when it follows a list marker, which
 * is the only position where it is a marker rather than literal text.
 */
function stripLeadingMarker(line: string): string {
  if (ATX_HEADING.test(line)) return line.replace(ATX_HEADING, "").trim();
  if (BLOCKQUOTE.test(line)) return line.replace(BLOCKQUOTE, "").trim();
  if (LIST_MARKER.test(line)) {
    const rest = line.replace(LIST_MARKER, "");
    return rest.replace(TASK_CHECKBOX, "").trim();
  }
  return line;
}

/**
 * Drop leading periods (hidden files) and trailing periods / spaces
 * (names Windows and several sync tools reject).
 */
function trimUnsafeEdges(stem: string): string {
  return stem.replace(/^\.+/, "").replace(/[. ]+$/, "").trim();
}

/**
 * Iterating with `for…of` walks code points, so a surrogate pair is copied
 * whole or not at all.
 */
function truncateStem(stem: string): string {
  const encoder = new TextEncoder();
  let out = "";
  let codePoints = 0;
  let bytes = 0;
  for (const ch of stem) {
    if (codePoints + 1 > MAX_STEM_CODE_POINTS) break;
    const size = encoder.encode(ch).length;
    if (bytes + size > MAX_STEM_BYTES) break;
    out += ch;
    codePoints += 1;
    bytes += size;
  }
  return out;
}

export function deriveQuickNoteStem(body: string, now: Date = new Date()): string {
  let stem = stripLeadingMarker(firstNonEmptyLine(body));

  stem = stem.replace(/\.md$/i, "");

  stem = stem.replace(UNSAFE_CHARS, "-");
  stem = stem.replace(/\s+/g, " ");
  stem = stem.replace(/-{2,}/g, "-");
  stem = trimUnsafeEdges(stem);

  // Truncation can expose a new trailing period or space, so the edge trim
  // runs again on the capped value rather than only on the full one.
  stem = trimUnsafeEdges(truncateStem(stem));

  if (stem.length === 0) return `note-${formatTimestamp(now)}`;
  return stem;
}

export function deriveQuickNoteFilename(body: string, now: Date = new Date()): string {
  return `${deriveQuickNoteStem(body, now)}.md`;
}
