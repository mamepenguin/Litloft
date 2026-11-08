/**
 * The source half of the no-horizontal-scroll rule: which files spell a
 * horizontal scroller that a mouse-environment layout must not have, and
 * nothing says to leave it alone.
 *
 * Pure by design, so the scan over the real tree and the seeded cases run
 * through the same code. A match is allowed only when it is guarded by
 * Tailwind's `pointer-coarse:` variant, when its JSX element carries
 * `data-hscroll-exempt`, or when it is one of the Markdown rules listed
 * below.
 */

export interface SourceFile {
  path: string;
  body: string;
}

export interface HscrollViolation {
  path: string;
  line: number;
  text: string;
}

export interface MouseEnvironmentDefinition {
  path: string;
  line: number;
  kind: "custom-variant" | "media";
  text: string;
}

/**
 * The content a reader is expected to scroll sideways on any pointer type:
 * Markdown tables, code blocks and mermaid diagrams. `code-view` (the
 * file-detail source viewer) carries no `overflow-x`; if it gains one, the
 * human decides whether to add it here.
 */
export const EXEMPT_SELECTORS = [
  ".markdown-body pre",
  ".markdown-body .markdown-table-scroll",
  ".markdown-body .code-block",
  ".mermaid-diagram",
] as const;

const CLASS_PATTERN = /\b(?:overflow-x-(?:auto|scroll)|snap-x)\b(?![\w-])/;
const CSS_PATTERN = /overflow-x\s*:\s*(?:auto|scroll)/;

const TOKEN_BOUNDARY = /[\s"'`{};<>(),]/;

const lineOf = (body: string, index: number) =>
  body.slice(0, index).split("\n").length;

function tokenStart(body: string, index: number): number {
  let start = index;
  while (start > 0 && !TOKEN_BOUNDARY.test(body[start - 1]!)) start -= 1;
  return start;
}

function guardedByPointerCoarse(body: string, index: number): boolean {
  const token = body.slice(tokenStart(body, index), index);
  return token.includes("pointer-coarse:");
}

/**
 * The closest open tag around the match. A JSX element may spread its
 * attributes over several lines, so the whole tag is read, not the line.
 */
function hasExemptMarker(body: string, index: number): boolean {
  const open = body.lastIndexOf("<", index);
  if (open === -1) return false;
  const close = body.indexOf(">", index);
  if (close === -1) return false;
  return body.slice(open, close + 1).includes("data-hscroll-exempt");
}

/**
 * The selector of the rule whose body holds `index`, with a leading
 * at-rule dropped. Comments are stripped before the comparison.
 */
function enclosingSelector(body: string, index: number): string {
  const openBrace = body.lastIndexOf("{", index);
  if (openBrace === -1) return "";
  const previous = Math.max(
    body.lastIndexOf("}", openBrace - 1),
    body.lastIndexOf("{", openBrace - 1),
    body.lastIndexOf(";", openBrace - 1),
  );
  return body
    .slice(previous + 1, openBrace)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

function selectorIsExempt(selector: string): boolean {
  return selector
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .some((part) =>
      (EXEMPT_SELECTORS as readonly string[]).includes(part),
    );
}

export function findHscrollViolations(
  sources: readonly SourceFile[],
): HscrollViolation[] {
  const violations: HscrollViolation[] = [];

  for (const { path, body } of sources) {
    const css = path.endsWith(".css");
    const pattern = css
      ? new RegExp(CSS_PATTERN.source, "g")
      : new RegExp(CLASS_PATTERN.source, "g");
    for (const match of body.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (css) {
        if (selectorIsExempt(enclosingSelector(body, index))) continue;
      } else if (
        guardedByPointerCoarse(body, index) ||
        hasExemptMarker(body, index)
      ) {
        continue;
      }
      violations.push({
        path,
        line: lineOf(body, index),
        text: match[0],
      });
    }
  }

  return violations;
}

const MOUSE_CUSTOM_VARIANT = /@custom-variant\s+mouse\b/g;
const FINE_HOVER_MEDIA =
  /@media\s*\(\s*hover:\s*hover\s*\)\s*and\s*\(\s*pointer:\s*fine\s*\)/g;
const FINE_HOVER_SPELLING = /\(\s*hover:\s*hover\s*\)\s*and\s*\(\s*pointer:\s*fine\s*\)/;

export function findMouseEnvironmentDefinitions(
  sources: readonly SourceFile[],
): MouseEnvironmentDefinition[] {
  const definitions: MouseEnvironmentDefinition[] = [];

  for (const { path, body } of sources) {
    const variants: { index: number; text: string }[] = [];
    for (const match of body.matchAll(MOUSE_CUSTOM_VARIANT)) {
      const index = match.index ?? 0;
      const text = body.slice(index, index + 400);
      variants.push({ index, text });
      definitions.push({
        path,
        line: lineOf(body, index),
        kind: "custom-variant",
        text,
      });
    }
    for (const match of body.matchAll(FINE_HOVER_MEDIA)) {
      const index = match.index ?? 0;
      // The spelling inside the custom variant is that definition, not a
      // second one.
      if (variants.some((v) => index >= v.index && index < v.index + 400)) {
        continue;
      }
      definitions.push({
        path,
        line: lineOf(body, index),
        kind: "media",
        text: body.slice(index, index + 400),
      });
    }
  }

  return definitions;
}

export function isFineHoverDefinition(text: string): boolean {
  return FINE_HOVER_SPELLING.test(text);
}
