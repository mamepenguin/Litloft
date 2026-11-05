import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import { MarkdownPreview } from "../../MarkdownPreview";
import { FindProvider, FindTextBodyProvider } from "../find/FindContext";
import type { FindContextValue } from "../find/types";
import type { FindAnswer, FindRow } from "@/lib/fileFind";

const TERM = "needle";

const ROW: FindRow = {
  kind: "text",
  ordinal: 1,
  snippet: "alpha needle bravo",
  match_start: "alpha ".length,
  match_length: TERM.length,
};

function findValue(row: FindRow): FindContextValue {
  const answer: FindAnswer = {
    query: TERM,
    indexed: true,
    total: 1,
    truncated: false,
    rows: [row],
  };
  const noop = () => {};
  return {
    enabled: true,
    shortcutEnabled: true,
    open: true,
    query: TERM,
    status: { kind: "hits", answer },
    filter: "all",
    rows: [row],
    visibleRows: [row],
    currentRow: row,
    currentIndex: 0,
    truncated: false,
    focusNonce: 0,
    selectRequest: null,
    openFind: noop,
    closeFind: noop,
    openFindByShortcut: () => false,
    changeQuery: noop,
    commitQuery: noop,
    compositionStart: noop,
    compositionEnd: noop,
    keyDown: noop,
    step: noop,
    selectRow: noop,
    selectFilter: noop,
    retry: noop,
    reportTab: noop,
    registerUrlStrip: noop,
  };
}

function body(source: string) {
  return render(
    <FindProvider value={findValue(ROW)}>
      <FindTextBodyProvider>
        <MarkdownPreview source={source} chrome={false} mermaid={false} />
      </FindTextBodyProvider>
    </FindProvider>,
  );
}

let scrolled: Element[] = [];
let original: typeof Element.prototype.scrollIntoView;

beforeEach(() => {
  scrolled = [];
  original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
});

afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = original;
});

describe("SPEC-CORE-028 I5 only the file body carries the current mark", () => {
  it("keeps the summary's plain marks but gives it no current mark or scroll", async () => {
    const { container } = render(
      <FindProvider value={findValue(ROW)}>
        <FindTextBodyProvider>
          <MarkdownPreview
            source="alpha needle bravo"
            chrome={false}
            mermaid={false}
          />
        </FindTextBodyProvider>
        <MarkdownPreview
          source="summary needle alpha"
          chrome={false}
          mermaid={false}
        />
      </FindProvider>,
    );
    const [bodyEl, summary] = Array.from(
      container.querySelectorAll<HTMLElement>(".markdown-body"),
    );

    await waitFor(() =>
      expect(bodyEl.querySelectorAll("mark.find-mark-current")).toHaveLength(1),
    );
    expect(summary.querySelectorAll("mark.find-mark-current")).toHaveLength(0);
    expect(summary.querySelectorAll("mark.find-mark")).toHaveLength(1);
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]).toBe(bodyEl.querySelector("mark.find-mark-current"));
  });

  it("does not scroll again when the same current row survives an HTML reset", async () => {
    const { container, rerender } = body("alpha needle bravo");
    const bodyEl = container.querySelector<HTMLElement>(".markdown-body")!;
    await waitFor(() => expect(scrolled).toHaveLength(1));

    rerender(
      <FindProvider value={findValue(ROW)}>
        <FindTextBodyProvider>
          <MarkdownPreview
            source="alpha needle bravo charlie"
            chrome={false}
            mermaid={false}
          />
        </FindTextBodyProvider>
      </FindProvider>,
    );

    await waitFor(() => expect(bodyEl.textContent).toContain("charlie"));
    await waitFor(() =>
      expect(bodyEl.querySelector("mark.find-mark-current")).not.toBeNull(),
    );
    expect(scrolled).toHaveLength(1);
  });
});
