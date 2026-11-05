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

  it("takes the context match nearest the ordinal when several match", () => {
    const context = { before: "same", after: "tail" };
    const occurrences = [context, context, context, context];
    const snippet = "same needle tail";
    expect(chooseCurrentOccurrence(occurrences, row(snippet, 2))).toBe(1);
    expect(chooseCurrentOccurrence(occurrences, row(snippet, 4))).toBe(3);
  });

  it("prefers the earlier occurrence when two context matches are equally near", () => {
    const context = { before: "same", after: "tail" };
    const occurrences = [context, { before: "x", after: "y" }, context];
    expect(chooseCurrentOccurrence(occurrences, row("same needle tail", 2))).toBe(0);
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

  it("answers null for a text row when no context matches", () => {
    const occurrences: FindOccurrenceContext[] = [
      { before: "aaa ", after: " bbb" },
      { before: "ccc ", after: " ddd" },
      { before: "eee ", after: " fff" },
    ];
    expect(chooseCurrentOccurrence(occurrences, row("zzz needle www", 2, "text"))).toBeNull();
    expect(chooseCurrentOccurrence(occurrences, row("zzz needle www", 9, "text"))).toBeNull();
  });

  it("answers null when the unit holds no occurrence", () => {
    expect(chooseCurrentOccurrence([], row("nothing here", 1))).toBeNull();
  });

  it("drops whitespace, punctuation and Markdown syntax before taking the windows", () => {
    const stored = [
      "First para ends here.",
      "",
      "needle starts para two.",
      "",
      "Other text needle end.",
    ].join("\n");
    const rendered = stored.replace(/\n\n/g, "\n");
    const layer = textLayer(`<span>${rendered}</span>`);

    markFindOccurrences(layer, TERM, row(stored, 2, "text"));

    const current = layer.querySelector("mark.find-mark-current");
    expect(current).not.toBeNull();
    expect(current!.nextSibling?.textContent ?? "").toMatch(/^ starts/);
  });

  it("matches a Markdown snippet to the rendered text it stands for", () => {
    const stored = "First para ends here.\n\n- needle starts the list.\n- second item.";
    const rendered = "First para ends here.\nneedle starts the list.\nsecond item.";
    const layer = textLayer(`<span>${rendered}</span>`);

    markFindOccurrences(layer, TERM, row(stored, 2, "text"));

    const current = layer.querySelector("mark.find-mark-current");
    expect(current).not.toBeNull();
    expect(current!.nextSibling?.textContent ?? "").toMatch(/^ starts the list/);
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

    markFindOccurrences(layer, TERM, row(text, 3, "text"));

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
