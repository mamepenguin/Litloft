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

const marksIn = (root: ParentNode) =>
  Array.from(root.querySelectorAll("mark.find-mark"));

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

  it("gives no current mark when the snippet is not in the source", () => {
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
