import { describe, expect, it } from "vitest";

import { passageHref } from "../searchPassages";
import type { SearchPassage } from "../searchMerge";

function screenText(overrides: Partial<SearchPassage> = {}): SearchPassage {
  return {
    kind: "screen_text",
    start: 12.48,
    end: 20.0,
    page: null,
    section: null,
    section_title: null,
    chunk_index: 0,
    text: "warehouse moved to Osaka",
    score: 0.8,
    keyword: true,
    highlight_terms: ["moved"],
    frame_url: "/api/addons/intelligence/files/f1/frame?t=12",
    ...overrides,
  };
}

function parse(href: string) {
  const url = new URL(href, "http://litloft.local");
  return {
    path: url.pathname,
    keys: [...url.searchParams.keys()],
    t: url.searchParams.get("t"),
    find: url.searchParams.get("find"),
  };
}

describe("SPEC-CORE-134 I5 a keyword screen_text passage links to its exact start with find on its link term", () => {
  it.each([
    [12.48, "12.480"],
    [725, "725.000"],
    [0, "0.000"],
  ])("writes the start %s as t=%s with three decimals", (start, text) => {
    expect(parse(passageHref("f1", screenText({ start })))).toEqual({
      path: "/files/f1",
      keys: ["t", "find"],
      t: text,
      find: "moved",
    });
  });

  it.each([
    ["倉庫 & 移転"],
    ["a b/c?d#e+f"],
  ])("encodes the term %s with encodeURIComponent, a space as %%20", (term) => {
    const href = passageHref("f1", screenText({ text: `see ${term} here`, highlight_terms: [term] }));

    expect(href).toBe(`/files/f1?t=12.480&find=${encodeURIComponent(term)}`);
    expect(href).toContain("%20");
    expect(parse(href).find).toBe(term);
  });

  it.each([
    {
      name: "the occurrence that starts first, not the first term",
      text: "warehouse moved to Osaka",
      terms: ["osaka", "warehouse"],
      expected: "warehouse",
    },
    {
      name: "the longer term when two start at the same place",
      text: "warehouse moved",
      terms: ["ware", "warehouse"],
      expected: "warehouse",
    },
    {
      name: "the earlier term when two also have the same length, as written in the terms",
      text: "it moved here",
      terms: ["MOVED", "moved"],
      expected: "MOVED",
    },
    {
      name: "a term found by ASCII folding, unfolded",
      text: "THE WAREHOUSE",
      terms: ["warehouse"],
      expected: "warehouse",
    },
    {
      name: "the kana variant that is in the excerpt, not the longest one",
      text: "ソウコ移転のお知らせ",
      terms: ["そうこいてん", "ソウコ"],
      expected: "ソウコ",
    },
  ])("takes $name", ({ text, terms, expected }) => {
    const href = passageHref("f1", screenText({ text, highlight_terms: terms }));

    expect(parse(href).find).toBe(expected);
    expect(parse(href).t).toBe("12.480");
  });

  it("links as before when the passage is vector-only or has no link term, beside one that has one", () => {
    expect(parse(passageHref("f1", screenText())).find).toBe("moved");

    expect(passageHref("f1", screenText({ keyword: false }))).toBe("/files/f1?t=12");
    expect(passageHref("f1", screenText({ highlight_terms: [] }))).toBe("/files/f1?t=12");
    expect(passageHref("f1", screenText({ highlight_terms: ["absent"] }))).toBe("/files/f1?t=12");
    expect(
      passageHref("f1", screenText({ kind: "utterance", highlight_terms: ["moved"] })),
    ).toBe("/files/f1?t=12");
  });
});
