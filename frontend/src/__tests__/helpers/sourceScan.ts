/**
 * The walk tracks string state, so a `//` inside a URL is not a comment.
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
 * The convention this relies on: **a constant holding Tailwind classes is
 * named `*_CLASS` or `*_CLASSES`.**
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
 * Collecting per line cannot see the static half of a multi-line template,
 * so the attribute value is walked as one span, brace to brace.
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
 * Use `stringLiterals` instead when the question is whether a single token
 * appears anywhere at all; the union of the two double-counts, because an
 * attribute span contains the literal inside it.
 */
export function classValues(text: string): string[] {
  const stripped = stripComments(text);
  return [
    ...classAttributeSpans(stripped),
    ...classConstSpans(stripped),
  ].map(([start, end]) => stripped.slice(start, end));
}

/**
 * Walks rather than matches: a regex for `"..."` cannot tell a quote inside a
 * template from one that opens a string.
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
