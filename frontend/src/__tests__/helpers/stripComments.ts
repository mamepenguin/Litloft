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
