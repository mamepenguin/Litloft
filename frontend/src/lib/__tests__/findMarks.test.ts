import { describe, expect, it } from "vitest";

import {
  chooseCurrentOccurrence,
  clearFindMarks,
  markFindOccurrences,
  type FindOccurrenceContext,
} from "@/lib/findMarks";

const TERM = "needle";

function row(
  snippet: string,
  ordinal: number,
  kind: "page" | "text" = "page",
  term = TERM,
) {
  return {
    kind,
    snippet,
    match_start: snippet.toLowerCase().indexOf(term.toLowerCase()),
    match_length: term.length,
    ordinal,
  };
}

const contextChar = /[\p{L}\p{N}]/u;

/** The windows `markFindOccurrences` hands the selection function. */
function windows(text: string, term = TERM): FindOccurrenceContext[] {
  const folded = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const needle = term.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const chars: string[] = [];
  const at = new Array<number>(folded.length + 1);
  for (let i = 0; i < folded.length; i += 1) {
    at[i] = chars.length;
    if (contextChar.test(folded[i])) chars.push(folded[i]);
  }
  at[folded.length] = chars.length;
  const projected = chars.join("");
  const out: FindOccurrenceContext[] = [];
  for (let raw = folded.indexOf(needle); raw >= 0; raw = folded.indexOf(needle, raw + needle.length)) {
    const start = at[raw];
    const end = at[raw + needle.length];
    out.push({
      before: projected.slice(Math.max(0, start - 20), start),
      after: projected.slice(end, end + 20),
    });
  }
  return out;
}

describe("chooseCurrentOccurrence", () => {
  it("takes the occurrence whose context matches over the ordinal", () => {
    const text =
      "alpha alpha alpha alpha needle bravo charlie charlie charlie Needle delta delta delta.";
    expect(
      chooseCurrentOccurrence(
        windows(text),
        row("charlie charlie charlie Needle delta delta delta.", 1),
      ),
    ).toBe(1);
  });

  it("folds ASCII before comparing the context", () => {
    const text = "CHARLIE CHARLIE CHARLIE needle DELTA DELTA DELTA.";
    expect(
      chooseCurrentOccurrence(
        windows(text),
        row("charlie charlie charlie Needle delta delta delta.", 2),
      ),
    ).toBe(0);
  });

  it("does not fold full-width letters", () => {
    const text = "ＮＥＥＤＬＥ and then a needle";
    expect(windows(text)).toHaveLength(1);
  });

  it("takes the only occurrence with the highest score over the ordinal", () => {
    const best = { before: "b".repeat(20), after: "c".repeat(20) };
    const other = { before: "x".repeat(20), after: "y".repeat(20) };
    const snippet = `${"b".repeat(20)} needle ${"c".repeat(20)}`;
    expect(chooseCurrentOccurrence([other, other, best, other], row(snippet, 1))).toBe(2);
  });

  it("falls back to the ordinal when two occurrences share the highest score", () => {
    const context = { before: "s".repeat(20), after: "t".repeat(20) };
    const occurrences = [
      context,
      { before: "x".repeat(20), after: "y".repeat(20) },
      context,
    ];
    const snippet = `${"s".repeat(20)} needle ${"t".repeat(20)}`;
    expect(chooseCurrentOccurrence(occurrences, row(snippet, 2))).toBe(1);
  });

  it("sums both sides rather than letting one side alone decide", () => {
    const before = "b".repeat(20);
    const after = "c".repeat(20);
    const snippet = `${before} needle ${after}`;
    const beforeOnly = { before, after: "z".repeat(20) };
    const afterOnly = { before: "z".repeat(20), after };
    const neither = { before: "x".repeat(20), after: "y".repeat(20) };
    expect(
      chooseCurrentOccurrence([beforeOnly, afterOnly, neither], row(snippet, 3)),
    ).toBe(2);
  });

  it("counts twenty letters on each side, not ten", () => {
    const snippetBefore = `${"a".repeat(10)}${"b".repeat(10)}`;
    const snippetAfter = `${"c".repeat(10)}${"d".repeat(10)}`;
    const snippet = `${snippetBefore} needle ${snippetAfter}`;
    const tenOnly = {
      before: `${"z".repeat(10)}${"b".repeat(10)}`,
      after: `${"c".repeat(10)}${"z".repeat(10)}`,
    };
    const full = { before: snippetBefore, after: snippetAfter };
    expect(chooseCurrentOccurrence([tenOnly, full], row(snippet, 1))).toBe(1);
  });

  it("does not withhold a score from an occurrence at the unit's start", () => {
    const before = "x".repeat(20);
    const snippet = `${before} needle ${"a".repeat(15)}b`;
    const occurrences: FindOccurrenceContext[] = [
      { before: "", after: "a".repeat(15) },
      { before: "q".repeat(20), after: "z".repeat(20) },
    ];
    expect(chooseCurrentOccurrence(occurrences, row(snippet, 2, "page"))).toBe(0);
  });

  it("takes a text row's occurrence whose context agrees on exactly ten letters", () => {
    const snippet = `${"a".repeat(10)} needle`;
    const occurrences: FindOccurrenceContext[] = [
      { before: "a".repeat(10), after: "" },
      { before: "b".repeat(20), after: "z".repeat(20) },
    ];
    expect(chooseCurrentOccurrence(occurrences, row(snippet, 1, "text"))).toBe(0);
  });

  it("withholds a text row's occurrence when its context agrees on only nine", () => {
    const snippet = `${"a".repeat(9)} needle`;
    const occurrences: FindOccurrenceContext[] = [
      { before: "a".repeat(9), after: "" },
    ];
    expect(chooseCurrentOccurrence(occurrences, row(snippet, 1, "text"))).toBeNull();
  });

  it("falls back to the ordinal on a page row when no context matches", () => {
    const occurrences: FindOccurrenceContext[] = [
      { before: "aaa ", after: " bbb" },
      { before: "ccc ", after: " ddd" },
      { before: "eee ", after: " fff" },
    ];
    expect(chooseCurrentOccurrence(occurrences, row("zzz needle www", 2, "page"))).toBe(1);
    expect(chooseCurrentOccurrence(occurrences, row("zzz needle www", 3, "page"))).toBe(2);
  });

  it("falls back to the first occurrence on a page row when the ordinal is past the end", () => {
    const occurrences: FindOccurrenceContext[] = [
      { before: "aaa ", after: " bbb" },
      { before: "ccc ", after: " ddd" },
    ];
    expect(chooseCurrentOccurrence(occurrences, row("zzz needle www", 9, "page"))).toBe(0);
  });

  it("answers null when the unit holds no occurrence", () => {
    expect(chooseCurrentOccurrence([], row("nothing here", 1))).toBeNull();
  });
});

function textLayer(html: string): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = "react-pdf__Page__textContent textLayer";
  layer.innerHTML = html;
  return layer;
}

const marked = (root: ParentNode) => Array.from(root.querySelectorAll("mark.find-mark"));

describe("markFindOccurrences in a pdf.js text layer", () => {
  it("marks every occurrence, including one split across text nodes", () => {
    const layer = textLayer(
      "<span>the quick brown </span><span>fox jumps nee</span><span>dle and Needle</span>",
    );

    markFindOccurrences(layer, TERM, null);

    const marks = marked(layer);
    expect(marks).toHaveLength(3);
    expect(marks.map((mark) => mark.textContent)).toEqual(["nee", "dle", "Needle"]);
    expect(marks[0].parentElement?.tagName).toBe("SPAN");
    expect(marks[1].parentElement?.tagName).toBe("SPAN");
    expect(layer.textContent).toBe(
      "the quick brown fox jumps needle and Needle",
    );
  });

  it("marks nothing in full-width letters, which the addon does not fold", () => {
    const layer = textLayer("<span>ＮＥＥＤＬＥ and needle</span>");
    markFindOccurrences(layer, TERM, null);
    expect(marked(layer).map((mark) => mark.textContent)).toEqual(["needle"]);
  });

  it("puts the current mark on one occurrence and leaves the others plain", () => {
    const text = "charlie charlie charlie Needle delta delta delta.";
    const layer = textLayer(`<span>unrelated </span><span>${text}</span>`);

    markFindOccurrences(layer, TERM, row(text, 3, "page"));

    const marks = marked(layer);
    const current = marks.filter((mark) => mark.classList.contains("find-mark-current"));
    expect(marks).toHaveLength(1);
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Needle");
  });

  it("re-applies after a clear without losing or duplicating a span-crossing match", () => {
    const layer = textLayer("<span>nee</span><span>dle and nee</span><span>dle</span>");

    markFindOccurrences(layer, TERM, null);
    clearFindMarks(layer);
    expect(marked(layer)).toHaveLength(0);
    markFindOccurrences(layer, TERM, null);

    expect(marked(layer)).toHaveLength(4);
    expect(layer.textContent).toBe("needle and needle");
  });

  it("removes every mark and leaves the layer's text as it was", () => {
    const layer = textLayer("<span>a needle here</span><span> and a Needle there</span>");
    const before = layer.textContent;

    markFindOccurrences(layer, TERM, null);
    clearFindMarks(layer);

    expect(marked(layer)).toHaveLength(0);
    expect(layer.textContent).toBe(before);
  });
});
