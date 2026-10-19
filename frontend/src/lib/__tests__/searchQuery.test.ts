import { describe, expect, it } from "vitest";

import { parseSearchQuery, resolveKinds } from "../searchQuery";

describe("parseSearchQuery", () => {
  it.each([
    ["plain text is kept byte for byte", "  京都  の寺 ", { text: "京都  の寺", hasOperators: false }],
    ["tags", "tag:旅行 tag:2024 京都", { text: "京都", tags: ["旅行", "2024"], hasOperators: true }],
    ["repeated tags collapse, case-insensitively", "tag:Trip tag:trip", { text: "", tags: ["Trip"] }],
    ["types, with the markdown alias", "type:VIDEO type:markdown", { text: "", types: ["video", "text"] }],
    ["repeated types collapse", "type:video type:video", { types: ["video"] }],
    ["is:", "is:favorite IS:Liked", { text: "", favorite: true, liked: true }],
    ["full-width colon", "tag：旅行", { tags: ["旅行"], text: "" }],
    ["full-width operator name", "ｔａｇ:旅行", { tags: ["旅行"] }],
    ["unknown operator is text", "tpye:video", { text: "tpye:video", hasOperators: false }],
    ["invalid type is text", "type:movie 京都", { text: "type:movie 京都", types: [], hasOperators: false }],
    ["invalid is: is text", "is:foo", { text: "is:foo", hasOperators: false }],
    ["empty value is text", "tag: 京都", { text: "tag: 京都", tags: [], hasOperators: false }],
    ["glued to text is text", "京都tag:x", { text: "京都tag:x", tags: [], hasOperators: false }],
    ["remaining text is single-spaced", "a  tag:x   b", { text: "a b", tags: ["x"] }],
  ])("%s", (_, q, expected) => {
    expect(parseSearchQuery(q)).toMatchObject(expected);
  });

  it("returns empty filters for an empty query", () => {
    expect(parseSearchQuery("")).toEqual({
      text: "",
      tags: [],
      types: [],
      favorite: false,
      liked: false,
      hasOperators: false,
    });
  });
});

describe("resolveKinds", () => {
  it.each([
    ["no fixed kind, no operators", null, [], { kinds: [], impossible: false }],
    ["fixed kind only", "video", [], { kinds: ["video"], impossible: false }],
    ["operators only", null, ["video", "image"], { kinds: ["video", "image"], impossible: false }],
    ["fixed kind among operators", "video", ["video", "image"], { kinds: ["video"], impossible: false }],
    ["fixed document holds text", "document", ["text", "video"], { kinds: ["text"], impossible: false }],
    ["fixed text inside a document operator", "text", ["document"], { kinds: ["text"], impossible: false }],
    ["disjoint", "video", ["image"], { kinds: [], impossible: true }],
  ] as const)("%s", (_, fixed, operators, expected) => {
    expect(resolveKinds(fixed, [...operators])).toEqual(expected);
  });
});
