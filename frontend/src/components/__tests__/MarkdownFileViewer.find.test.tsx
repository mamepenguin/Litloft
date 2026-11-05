import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import { MarkdownFileViewer } from "../MarkdownFileViewer";
import { FindProvider } from "../FileDetail/find/FindContext";
import type { FindContextValue } from "../FileDetail/find/types";
import type { FindAnswer, FindRow } from "@/lib/fileFind";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getWikiResolutions: async () => ({}),
}));

const TERM = "needle";
const SOURCE = "alpha needle bravo";

const ROW: FindRow = {
  kind: "text",
  ordinal: 1,
  snippet: SOURCE,
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

let scrolled: Element[] = [];
let original: typeof Element.prototype.scrollIntoView;

beforeEach(() => {
  scrolled = [];
  original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(SOURCE, { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = original;
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-028 I5 the Markdown file viewer carries the current mark", () => {
  it("gives the body a current mark through its own provider", async () => {
    const { container } = render(
      <FindProvider value={findValue(ROW)}>
        <MarkdownFileViewer fileId="md0000000001" />
      </FindProvider>,
    );

    await waitFor(() => {
      const body = container.querySelector(".markdown-body");
      expect(body).not.toBeNull();
      const current = body!.querySelector("mark.find-mark-current");
      expect(current).not.toBeNull();
      expect(scrolled).toContain(current);
    });
  });
});
