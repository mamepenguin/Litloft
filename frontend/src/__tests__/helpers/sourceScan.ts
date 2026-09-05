/**
 * Blank every comment, keeping offsets and line breaks intact.
 *
 * Source-scanning detectors have to read code without reading the prose
 * around it. Two of them have been fooled by the difference: a scan for
 * colour utilities pairs quote marks inside a sentence ("the `target` chunk")
 * and reports fragments of English as class names, and a scan for `<h1>`
 * counts `PageHeader`'s own sentence "An `<h1>` is emitted only when this is
 * given" as a heading.
 *
 * The walk tracks string state, so a `//` inside a URL is not a comment.
 * A regex written naively over `/* … *\/` blanks from the first `/*` in a
 * string literal to the next `*\/` anywhere after it, which silently erases
 * real code — that is how the `<h1>`s in `app/admin/page.tsx` went missing
 * from a scan that reported the file as clean.
 *
 * Blanking rather than deleting keeps reported line numbers true.
 */
export function stripComments(text: string): string {
  const out = text.split("");
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === c) { i++; break; }
        i++;
      }
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") out[i++] = " ";
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const stop = close === -1 ? text.length : close + 2;
      for (; i < stop; i++) if (text[i] !== "\n") out[i] = " ";
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * A class list is not always written at the point of use.
 *
 * A shared component exists precisely so a recipe lives in one place, which
 * moves it out of a `className=` attribute and into a `const` — and out of
 * this scan, which is how `Button.tsx` came to hold the project's only copy of
 * the accent fill and the disabled treatment while being invisible to the test
 * enforcing both. Centralising a rule must not cost the rule its enforcement.
 *
 * The convention this relies on: **a constant holding Tailwind classes is
 * named `*_CLASS` or `*_CLASSES`.** Matching on a name rather than sniffing
 * every string literal keeps the scan explicit — a constant opts in by being
 * named for what it is, and one that is not named that way is not silently
 * assumed to be prose.
 */
export function classConstSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*_CLASS(?:ES)?\b[^=\n]*=\s*/g,
  )) {
    const at = m.index! + m[0].length;
    const opener = text[at];
    if (opener === '"' || opener === "'" || opener === "`") {
      // Adjacent literals joined with `+` are one list; take to the statement end.
      let i = at + 1;
      for (; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === opener) {
          const rest = text.slice(i + 1);
          const cont = /^\s*\+\s*["'`]/.exec(rest);
          if (!cont) break;
          i += cont[0].length;
        }
      }
      if (i < text.length) spans.push([at, i + 1]);
    } else if (opener === "{" || opener === "[") {
      const close = opener === "{" ? "}" : "]";
      let depth = 0;
      let i = at;
      for (; i < text.length; i++) {
        if (text[i] === opener) depth++;
        else if (text[i] === close && --depth === 0) break;
      }
      if (i < text.length) spans.push([at, i + 1]);
    }
  }
  return spans;
}

/**
 * Character spans of every `className` / `class` attribute value in a file.
 *
 * Collecting per line cannot see the static half of a multi-line template —
 * `` className={`… border-bg-border … ${ `` contributes nothing if the closing
 * backtick is on a later line, and that is a shape this codebase uses freely.
 * Walking the attribute value as one span, brace to brace, reads it whole.
 */

export function classAttributeSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(/\bclass(?:Name)?\s*=\s*/g)) {
    const at = m.index! + m[0].length;
    const opener = text[at];
    if (opener === '"' || opener === "'" || opener === "`") {
      const close = text.indexOf(opener, at + 1);
      if (close !== -1) spans.push([at, close + 1]);
    } else if (opener === "{") {
      let depth = 0;
      let i = at;
      for (; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) break;
      }
      if (i < text.length) spans.push([at, i + 1]);
    }
  }
  return spans;
}

/**
 * Every `className` value in a file, as one string each.
 *
 * Attribute spans and `*_CLASS` constant spans, so a check that needs two
 * utilities in *one* value — "is this button both accent-filled and faded when
 * disabled" — sees them together. Use `stringLiterals` instead when the
 * question is whether a single token appears anywhere at all: this cannot see
 * a class list held under any other name, and the union of the two
 * double-counts, because an attribute span contains the literal inside it.
 */
export function classValues(text: string): string[] {
  const stripped = stripComments(text);
  return [
    ...classAttributeSpans(stripped),
    ...classConstSpans(stripped),
  ].map(([start, end]) => stripped.slice(start, end));
}

/**
 * Every quoted string and template literal, wherever it sits.
 *
 * Walks rather than matches: a regex for `"..."` cannot tell a quote inside a
 * template from one that opens a string, and `stripComments` already has the
 * scanner that can.
 */
export function stringLiterals(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const start = i + 1;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === c) break;
        i++;
      }
      out.push(text.slice(start, i));
      i++;
    } else {
      i++;
    }
  }
  return out;
}
