import { describe, expect, it } from "vitest";

import { readDocumentSelection } from "../documentCapture";

function selectText(node: Text, start = 0, end = node.data.length): Selection {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe("readDocumentSelection", () => {
  it("normalizes a selection contained by a plain-text preview", () => {
    const root = document.createElement("div");
    root.innerHTML = "<pre>alpha\n   beta</pre>";
    document.body.append(root);

    const selection = selectText(root.querySelector("pre")!.firstChild as Text);

    expect(readDocumentSelection(root, selection)).toMatchObject({
      kind: "selection",
      quote: "alpha beta",
    });
  });

  it("rejects a selection that crosses the preview boundary", () => {
    const root = document.createElement("div");
    const inside = document.createTextNode("inside");
    const outside = document.createTextNode("outside");
    root.append(inside);
    document.body.append(root, outside);
    const range = document.createRange();
    range.setStart(inside, 0);
    range.setEnd(outside, outside.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readDocumentSelection(root, selection)).toBeNull();
  });

  it("keeps the nearest preceding Markdown heading as the locator label", () => {
    const root = document.createElement("article");
    root.innerHTML = `
      <h1>Guide</h1><p>intro</p>
      <h2>Installation</h2><p>Run the installer now.</p>
      <h2>Usage</h2><p>Open the application.</p>
    `;
    document.body.append(root);
    const text = root.querySelectorAll("p")[1].firstChild as Text;

    const capture = readDocumentSelection(root, selectText(text), {
      includeHeading: true,
    });

    expect(capture?.locator).toEqual({ label: "Installation" });
  });

  it("derives a one-based PDF page from the selected text layer", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <section data-pdf-page="3"><span>Selected PDF text</span></section>
    `;
    document.body.append(root);
    const text = root.querySelector("span")!.firstChild as Text;

    const capture = readDocumentSelection(root, selectText(text), {
      includePdfPage: true,
    });

    expect(capture).toMatchObject({
      quote: "Selected PDF text",
      locator: { page: 3 },
    });
  });
});
