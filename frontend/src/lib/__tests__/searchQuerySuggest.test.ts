import { describe, expect, it } from "vitest";

import { activeOperatorValue, completeOperator, suggestValues } from "../searchQuery";

describe("activeOperatorValue", () => {
  it.each([
    ["tag:旅", { operator: "tag", partial: "旅", replaceFrom: 0 }],
    ["京都 tag:", { operator: "tag", partial: "", replaceFrom: 3 }],
    ["TYPE：vi", { operator: "type", partial: "vi", replaceFrom: 0 }],
    ["a is:f", { operator: "is", partial: "f", replaceFrom: 2 }],
    ["tag:旅 ", null],
    ["tag:旅 京都", null],
    ["tpye:vi", null],
    ["京都", null],
    ["", null],
  ] as const)("%j", (q, expected) => {
    expect(activeOperatorValue(q)).toEqual(expected);
  });
});

describe("completeOperator", () => {
  it("replaces the token being typed and leaves room for the next word", () => {
    const q = "京都 TAG：旅";
    expect(completeOperator(q, activeOperatorValue(q)!, "旅行")).toBe("京都 tag:旅行 ");
  });
});

describe("suggestValues", () => {
  const tags = [
    { name: "旅館", count: 3 },
    { name: "旅行", count: 42 },
    { name: "一人旅", count: 9 },
    { name: "空", count: 0 },
    { name: "料理", count: 7 },
  ];

  it.each([
    ["tags: prefix first, then by count; unused tags left out", "tag", "旅", [], ["旅行", "旅館", "一人旅"]],
    ["tags already in the query are left out, case-insensitively", "tag", "", ["旅行"], ["一人旅", "料理", "旅館"]],
    ["kinds: prefix first, then the vocabulary's order", "type", "d", [], ["document", "video", "audio", "pdf"]],
    ["kinds ignore case", "type", "IMA", [], ["image"]],
    ["flags", "is", "", [], ["favorite", "liked"]],
  ] as const)("%s", (_, operator, partial, used, expected) => {
    const values = suggestValues({ operator, partial, replaceFrom: 0 }, tags, [...used]).map((s) => s.value);
    expect(values).toEqual(expected);
  });

  it("offers at most eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `t${i}`, count: 12 - i }));
    expect(suggestValues({ operator: "tag", partial: "t", replaceFrom: 0 }, many, [])).toHaveLength(8);
  });
});
