/**
 * A line is an element so that a CSS counter can number it, and the counter is
 * how the number stays out of `Selection.toString()` and out of the text a
 * `TreeWalker` collects.
 *
 * Neither function returns the break. The caller writes it back inside the
 * line element, and has to: the citation search concatenates text nodes with
 * nothing between them, so a break that is not in the text runs two lines
 * together in the haystack it searches.
 */

const BREAK = /\r?\n/;

/** Only the empty entry a trailing break leaves; a blank line is a line. */
function dropTrailingEmpty(lines: string[]): string[] {
  return lines.length > 0 && lines[lines.length - 1] === ""
    ? lines.slice(0, -1)
    : lines;
}

export function splitPlainLines(text: string): string[] {
  if (text === "") return [];
  return dropTrailingEmpty(text.split(BREAK));
}

/**
 * Splits highlight.js output into one HTML string per line, reopening every
 * span a break falls inside. A block comment, a template literal and a
 * multi-line string all produce one span covering several lines, so the naive
 * split on `\n` would leave unbalanced markup.
 *
 * The parse is a `<template>`, which is inert: highlight.js escapes the source
 * before wrapping it, and nothing here is fetched or executed.
 */
export function splitHighlightedLines(html: string): string[] {
  if (html === "") return [];

  const template = document.createElement("template");
  template.innerHTML = html;

  const lines: HTMLElement[] = [];
  /** The elements the walk is currently inside, in the source markup. */
  const open: Element[] = [];

  let line = document.createElement("span");
  let cursor: Element = line;

  const beginLine = (): void => {
    line = document.createElement("span");
    cursor = line;
    for (const element of open) {
      const reopened = element.cloneNode(false) as Element;
      cursor.appendChild(reopened);
      cursor = reopened;
    }
  };

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.nodeValue ?? "").split(BREAK);
      parts.forEach((part, i) => {
        if (i > 0) {
          lines.push(line);
          beginLine();
        }
        if (part !== "") cursor.appendChild(document.createTextNode(part));
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    const copy = element.cloneNode(false) as Element;
    cursor.appendChild(copy);
    cursor = copy;
    open.push(element);
    node.childNodes.forEach(visit);
    open.pop();
    // Not the saved parent: a break inside these children rebuilt the chain,
    // and the cursor then sits on the reopened copy at this same depth.
    cursor = cursor.parentElement ?? line;
  };

  template.content.childNodes.forEach(visit);
  lines.push(line);

  // A line carries no break of its own — the caller writes it — so the entry
  // a trailing newline leaves is the empty one at the end.
  const asHtml = lines.map((l) => l.innerHTML);
  return lines[lines.length - 1].textContent === ""
    ? asHtml.slice(0, -1)
    : asHtml;
}
