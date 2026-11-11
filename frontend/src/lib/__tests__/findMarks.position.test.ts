import { describe, expect, it } from "vitest";

import {
  locateTextRow,
  markFindOccurrences,
  type FindMarkRow,
} from "@/lib/findMarks";

const foldAscii = (text: string) =>
  text.replace(/[A-Z]/g, (character) => character.toLowerCase());

/** The code-point indices of `term` in `source`, as the addon finds them. */
function termPositions(source: string, term: string): number[] {
  const chars = Array.from(foldAscii(source));
  const needle = Array.from(foldAscii(term));
  const found: number[] = [];
  for (let at = 0; at + needle.length <= chars.length; ) {
    if (needle.every((character, offset) => chars[at + offset] === character)) {
      found.push(at);
      at += needle.length;
    } else {
      at += 1;
    }
  }
  return found;
}

/** One row as the addon builds it, in code points: 80 either side, 「…」 where cut. */
function addonRow(
  source: string,
  at: number,
  ordinal: number,
  term: string,
): FindMarkRow {
  const chars = Array.from(source);
  const length = Array.from(term).length;
  const start = Math.max(0, at - 80);
  const end = Math.min(chars.length, at + length + 80);
  const head = start > 0 ? "…" : "";
  const tail = end < chars.length ? "…" : "";
  return {
    kind: "text",
    ordinal,
    snippet: `${head}${chars.slice(start, end).join("")}${tail}`,
    match_start: at - start + head.length,
    match_length: length,
  };
}

function textLayer(text: string): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = "react-pdf__Page__textContent textLayer";
  layer.textContent = text;
  return layer;
}

function markdownBlockLayer(rendered: string, sourceLines: string): HTMLDivElement {
  const layer = document.createElement("div");
  const block = document.createElement("p");
  block.setAttribute("data-source-lines", sourceLines);
  block.textContent = rendered;
  layer.appendChild(block);
  return layer;
}

const marksIn = (root: ParentNode) =>
  Array.from(root.querySelectorAll("mark.find-mark"));

function currentMarkIndex(layer: HTMLElement): number | null {
  const marks = marksIn(layer);
  const current = marks.filter((mark) =>
    mark.classList.contains("find-mark-current"),
  );
  return current.length === 1 ? marks.indexOf(current[0]) : null;
}

const CSV_TERM = "budget";
const CSV_LINES = Array.from(
  { length: 20 },
  (_, index) =>
    `${index + 1},${CSV_TERM} item ${index + 1},note ${String.fromCharCode(
      97 + index,
    )} marker`,
);
const CSV_RAW = ["id,item,note", ...CSV_LINES].join("\n");
const CSV_CLEANED = CSV_RAW.replace(/,/g, " ");

const VTT_CUES = Array.from(
  { length: 10 },
  (_, index) =>
    `Cue ${index + 1} explains the annual ${CSV_TERM} for the ${
      ["north", "south", "east", "west", "harbor", "river", "hill", "bay", "pier", "gate"][index]
    } team before the ${["spring", "summer", "autumn", "winter", "annual", "quarterly", "monthly", "weekly", "final", "first"][index]} review.`,
);
const VTT_RAW = [
  "WEBVTT",
  "",
  ...VTT_CUES.flatMap((cue, index) => [
    `00:00:${String(index * 2).padStart(2, "0")}.000 --> 00:00:${String(
      index * 2 + 1,
    ).padStart(2, "0")}.000`,
    cue,
    "",
  ]),
].join("\n");
const VTT_CLEANED = VTT_CUES.join(" ");

describe("locateTextRow", () => {
  it("compares whitespace runs as one space and returns the source offset", () => {
    const source = "alpha\n\nneedle bravo";
    const row: FindMarkRow = {
      kind: "text",
      ordinal: 1,
      snippet: "alpha needle bravo",
      match_start: "alpha ".length,
      match_length: "needle".length,
    };
    expect(locateTextRow(source, row)).toBe(source.indexOf("needle"));
  });

  it("drops the 「…」 and reads match_start in code points", () => {
    const source = `${"a".repeat(85)}🚨 needle tail`;
    const at = termPositions(source, "needle")[0];
    const row = addonRow(source, at, 1, "needle");
    expect(row.snippet.startsWith("…")).toBe(true);
    expect(locateTextRow(source, row)).toBe(source.indexOf("needle"));
  });

  it("takes the occurrence nearest the ordinal when the snippet repeats", () => {
    const line = "check the beacon lamp every morning";
    const source = Array.from({ length: 12 }, () => line).join("\n");
    const positions = termPositions(source, "beacon");
    for (const ordinal of [1, 5, 9, 12]) {
      const row = addonRow(source, positions[ordinal - 1], ordinal, "beacon");
      const core = row.snippet.replace(/^…/, "").replace(/…$/, "");
      expect(source.split(core).length - 1).toBeGreaterThan(1);
      expect(locateTextRow(source, row)).toBe(positions[ordinal - 1]);
    }
  });

  it("answers null when the snippet is not in the source", () => {
    const row: FindMarkRow = {
      kind: "text",
      ordinal: 1,
      snippet: "nothing of the sort",
      match_start: 0,
      match_length: "needle".length,
    };
    expect(locateTextRow("alpha needle bravo", row)).toBeNull();
  });
});

const KNOWLEDGE_NOTE = [
  "---",
  "id: '20261105044628'",
  "title: Beacon maintenance notes",
  "tags:",
  "- beacon",
  "---",
  "",
  "# Beacon maintenance",
  "",
  "The beacon on the north pier was cleaned on Monday.",
].join("\n");

function bodyOf(note: string): string {
  const lines = note.split("\n");
  if (lines[0] !== "---") return note;
  const close = lines.indexOf("---", 1);
  return close < 0 ? note : lines.slice(close + 1).join("\n");
}

describe("locateTextRow when the rendered source starts at the body", () => {
  it("drops the front of a snippet that reaches into the frontmatter", () => {
    const body = bodyOf(KNOWLEDGE_NOTE);
    const positions = termPositions(KNOWLEDGE_NOTE, "beacon");
    const bodyPositions = termPositions(body, "beacon");
    for (const ordinal of [3, 4]) {
      const row = addonRow(KNOWLEDGE_NOTE, positions[ordinal - 1], ordinal, "beacon");
      expect(locateTextRow(body, row)).toBe(bodyPositions[ordinal - 3]);
    }
  });

  it("leaves a title or tag row unlocated", () => {
    const body = bodyOf(KNOWLEDGE_NOTE);
    const positions = termPositions(KNOWLEDGE_NOTE, "beacon");
    for (const ordinal of [1, 2]) {
      const row = addonRow(KNOWLEDGE_NOTE, positions[ordinal - 1], ordinal, "beacon");
      expect(locateTextRow(body, row)).toBeNull();
    }
  });
});

describe("markFindOccurrences in a Markdown block", () => {
  it("scores each visible row on its own occurrence when the source hides one", () => {
    const source =
      "[docs](https://example.com/budget/x) then budget and budget again";
    const rendered = "docs then budget and budget again";
    const positions = termPositions(source, "budget");
    const current: (number | null)[] = [];
    for (let ordinal = 1; ordinal <= positions.length; ordinal += 1) {
      const layer = markdownBlockLayer(rendered, "0-1");
      const row = addonRow(source, positions[ordinal - 1], ordinal, "budget");
      markFindOccurrences(layer, "budget", row, {
        text: source,
        bodyStartLine: 0,
        mode: "markdown",
      });
      current.push(currentMarkIndex(layer));
    }
    expect(current).toEqual([null, 0, 1]);
  });
});

describe("markFindOccurrences with a snippet cut from different text", () => {
  it.each([
    ["CSV", CSV_RAW, CSV_CLEANED],
    ["VTT", VTT_RAW, VTT_CLEANED],
  ])("lands every %s row on its own occurrence", (_name, rendered, cleaned) => {
    const positions = termPositions(cleaned, CSV_TERM);
    const landed: number[] = [];
    for (let ordinal = 1; ordinal <= positions.length; ordinal += 1) {
      const layer = textLayer(rendered);
      const row = addonRow(cleaned, positions[ordinal - 1], ordinal, CSV_TERM);
      markFindOccurrences(layer, CSV_TERM, row, {
        text: rendered,
        bodyStartLine: 0,
        mode: "plain",
      });
      const index = currentMarkIndex(layer);
      if (index !== null) landed.push(index);
    }
    expect(landed).toEqual(positions.map((_, index) => index));
  });
});

describe("markFindOccurrences in a plain text source", () => {
  it("puts the current mark on the occurrence at the located source position", () => {
    const line = "check the beacon lamp every morning";
    const source = Array.from({ length: 12 }, () => line).join("\n");
    const at = termPositions(source, "beacon")[5];
    const row = addonRow(source, at, 6, "beacon");
    const layer = textLayer(source);

    markFindOccurrences(layer, "beacon", row, {
      text: source,
      bodyStartLine: 0,
      mode: "plain",
    });

    const marks = marksIn(layer);
    const current = marks.filter((mark) =>
      mark.classList.contains("find-mark-current"),
    );
    expect(current).toHaveLength(1);
    expect(marks.indexOf(current[0])).toBe(5);
  });

  it("puts each repeated line's row on its own line", () => {
    const source = Array.from({ length: 6 }, () => "check the beacon").join("\n");
    const positions = termPositions(source, "beacon");
    for (let ordinal = 1; ordinal <= positions.length; ordinal += 1) {
      const row = addonRow(source, positions[ordinal - 1], ordinal, "beacon");
      const layer = textLayer(source);
      markFindOccurrences(layer, "beacon", row, {
        text: source,
        bodyStartLine: 0,
        mode: "plain",
      });
      const marks = marksIn(layer);
      const current = marks.filter((mark) =>
        mark.classList.contains("find-mark-current"),
      );
      expect(current).toHaveLength(1);
      expect(marks.indexOf(current[0])).toBe(ordinal - 1);
    }
  });

  it("scores the whole text when the snippet is not in the source", () => {
    const source = "alpha needle bravo";
    const layer = textLayer(source);
    const row: FindMarkRow = {
      kind: "text",
      ordinal: 2,
      snippet: "alpha needle bravo!",
      match_start: "alpha ".length,
      match_length: "needle".length,
    };

    markFindOccurrences(layer, "needle", row, {
      text: source,
      bodyStartLine: 0,
      mode: "plain",
    });

    expect(currentMarkIndex(layer)).toBe(0);
  });

  it("gives no current mark when a not-found snippet's context matches nothing", () => {
    const source = "alpha needle bravo";
    const layer = textLayer(source);
    const row: FindMarkRow = {
      kind: "text",
      ordinal: 2,
      snippet: "nothing of the sort",
      match_start: 0,
      match_length: "needle".length,
    };

    markFindOccurrences(layer, "needle", row, {
      text: source,
      bodyStartLine: 0,
      mode: "plain",
    });

    expect(layer.querySelector("mark.find-mark-current")).toBeNull();
  });
});
