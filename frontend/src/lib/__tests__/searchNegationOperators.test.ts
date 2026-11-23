/**
 * SPEC-CORE-172: `-` before an operator and the `has:` operator: parsing,
 * caps, chips and chip removal, value completion, and the filter the meaning
 * stage receives.
 */

import { describe, expect, it } from "vitest";

import {
  activeOperatorValue,
  completeOperator,
  filterFromParsed,
  filterQueryParam,
  operatorChips,
  parseSearchQuery,
  removeOperatorChip,
  suggestValues,
} from "../searchQuery";

type Parsed = ReturnType<typeof parseSearchQuery> & {
  excludedTags: string[];
  excludedTypes: string[];
  excludedFolders: string[];
  excludedCollections: string[];
  notFavorite: boolean;
  notLiked: boolean;
  hasTag: boolean;
  noTag: boolean;
  hasCollection: boolean;
  noCollection: boolean;
};

const parse = (q: string) => parseSearchQuery(q) as Parsed;

const wire = (q: string): Record<string, unknown> =>
  JSON.parse(filterQueryParam(filterFromParsed(parseSearchQuery(q), null)));

const chipAt = (q: string, index: number) => operatorChips(q)[index];

const NEW_FLAGS = {
  notFavorite: false,
  notLiked: false,
  hasTag: false,
  noTag: false,
  hasCollection: false,
  noCollection: false,
};

const NO_NEW_LISTS = {
  excludedTags: [],
  excludedTypes: [],
  excludedFolders: [],
  excludedCollections: [],
};

describe("SPEC-CORE-172 parsing 1 a negated operator", () => {
  it.each([
    ["-tag:trip", { excludedTags: ["trip"], tags: [] }],
    ["-type:video", { excludedTypes: ["video"], types: [] }],
    ["-path:Work/old", { excludedFolders: ["Work/old"], folders: [] }],
    ["-in:読了", { excludedCollections: ["読了"], collections: [] }],
    ["-is:favorite", { notFavorite: true, favorite: false }],
    ["-is:liked", { notLiked: true, liked: false }],
  ])("%s is that operator, negated", (q, expected) => {
    expect(parse(q)).toMatchObject({ ...expected, text: "", hasOperators: true });
  });

  it.each([
    ["a full-width hyphen-minus", "－tag:trip"],
    ["an upper-case name", "-TAG:trip"],
    ["a full-width name and colon", "-ｔａｇ：trip"],
  ])("reads %s after NFKC", (_name, q) => {
    expect(parse(q)).toMatchObject({ excludedTags: ["trip"], text: "" });
  });

  it("reads the value by the positive operator's rules", () => {
    expect(parse('-path:"/My Photos/" -type:markdown -in:"  Trip  "')).toMatchObject({
      excludedFolders: ["My Photos"],
      excludedTypes: ["text"],
      excludedCollections: ["Trip"],
      text: "",
    });
  });

  it.each([
    ["an unusable kind", "-type:movie"],
    ["an unusable flag", "-is:watched"],
    ["an unusable has: value", "-has:comment"],
    ["the root folder", "-path:/"],
    ["a dot-dot folder", "-path:.."],
    ["an empty value", "-tag:"],
    ["empty quotes", '-in:""'],
  ])("turns the whole token into text for %s, `-` included", (_name, q) => {
    const parsed = parse(`${q} -tag:anchor`);

    expect(parsed.excludedTags).toEqual(["anchor"]);
    expect(parsed.text).toBe(q);
    expect(parsed).toMatchObject({
      excludedTypes: [],
      excludedFolders: [],
      excludedCollections: [],
      notFavorite: false,
      noTag: false,
      noCollection: false,
    });
  });

  it.each([
    ["-size:", "-size:>1GB"],
    ["-duration:", "-duration:>=30m"],
    ["-modified:", "-modified:<2024"],
    ["a double hyphen", "--tag:x"],
    ["a hyphen with no name", "-:x"],
    ["! in place of -", "!tag:x"],
    ["a word with no colon", "-京都"],
    ["a quoted token", '"-tag:x"'],
  ])("leaves %s as text", (_name, q) => {
    const parsed = parse(`${q} -tag:anchor`);

    expect(parsed.text).toBe(q);
    expect(parsed.excludedTags).toEqual(["anchor"]);
    expect(parsed.sizes).toEqual([]);
    expect(parsed.durations).toEqual([]);
    expect(parsed.tags).toEqual([]);
  });
});

describe("SPEC-CORE-172 parsing 2 has: takes tag or collection", () => {
  it.each([
    ["has:tag", { hasTag: true }],
    ["-has:tag", { noTag: true }],
    ["has:collection", { hasCollection: true }],
    ["-has:collection", { noCollection: true }],
    ["HAS:TAG", { hasTag: true }],
    ["ｈａｓ：Ｃｏｌｌｅｃｔｉｏｎ", { hasCollection: true }],
    ["－ＨＡＳ:tag", { noTag: true }],
  ])("%s", (q, flags) => {
    expect(parse(q)).toMatchObject({
      ...NEW_FLAGS,
      ...flags,
      text: "",
      hasOperators: true,
    });
  });

  it.each(["has:comment", "has:", "has:tags", "has:subtitle"])(
    "%s is text",
    (q) => {
      const parsed = parse(`${q} has:tag`);

      expect(parsed.text).toBe(q);
      expect(parsed).toMatchObject({ hasTag: true, noTag: false, hasCollection: false, noCollection: false });
    },
  );
});

describe("SPEC-CORE-172 parsing 3 the new lists keep first appearance and deduplicate", () => {
  it("tags and collection names case-insensitively", () => {
    expect(parse("-tag:Trip -tag:2023 -tag:trip -in:Read -in:read -in:Work")).toMatchObject({
      excludedTags: ["Trip", "2023"],
      excludedCollections: ["Read", "Work"],
      text: "",
    });
  });

  it("folders after normalisation, case-sensitively", () => {
    expect(parse("-path:A -path:/A/ -path:a -path:A/b").excludedFolders).toEqual([
      "A",
      "a",
      "A/b",
    ]);
  });

  it("kinds exactly, with the markdown alias", () => {
    expect(parse("-type:pdf -type:markdown -type:text -type:PDF").excludedTypes).toEqual([
      "pdf",
      "text",
    ]);
  });

  it("the same value in both polarities is kept in both lists", () => {
    expect(parse("tag:x -tag:x path:A -path:A in:C -in:C type:pdf -type:pdf")).toMatchObject({
      tags: ["x"],
      excludedTags: ["x"],
      folders: ["A"],
      excludedFolders: ["A"],
      collections: ["C"],
      excludedCollections: ["C"],
      types: ["pdf"],
      excludedTypes: ["pdf"],
    });
  });

  it("a query with no new token leaves every new field at its default", () => {
    expect(parse("tag:会議 type:pdf is:favorite path:A in:B 予算")).toMatchObject({
      ...NO_NEW_LISTS,
      ...NEW_FLAGS,
      tags: ["会議"],
      favorite: true,
      text: "予算",
    });
    expect(parse("-tag:x")).toMatchObject({ excludedTags: ["x"] });
  });
});

describe("SPEC-CORE-172 parsing 4 caps", () => {
  const range = (n: number, make: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => make(i));

  it("ten excluded folders are kept and the eleventh is text", () => {
    const parsed = parse([...range(10, (i) => `-path:f${i}`), "-path:f10"].join(" "));

    expect(parsed.excludedFolders).toEqual(range(10, (i) => `f${i}`));
    expect(parsed.text).toBe("-path:f10");
  });

  it("excluded folders are counted apart from folders", () => {
    const parsed = parse([...range(10, (i) => `path:f${i}`), ...range(10, (i) => `-path:g${i}`)].join(" "));

    expect(parsed.folders).toHaveLength(10);
    expect(parsed.excludedFolders).toHaveLength(10);
    expect(parsed.text).toBe("");
  });

  it("ten excluded collections are kept and the eleventh is text", () => {
    const parsed = parse([...range(10, (i) => `-in:c${i}`), "-in:c10"].join(" "));

    expect(parsed.excludedCollections).toEqual(range(10, (i) => `c${i}`));
    expect(parsed.text).toBe("-in:c10");
  });

  it("excluded collections are counted apart from collections", () => {
    const parsed = parse([...range(10, (i) => `in:c${i}`), ...range(10, (i) => `-in:d${i}`)].join(" "));

    expect(parsed.collections).toHaveLength(10);
    expect(parsed.excludedCollections).toHaveLength(10);
    expect(parsed.text).toBe("");
  });

  it("a duplicate does not spend the cap", () => {
    const parsed = parse(["-path:f0", "-path:/f0/", ...range(9, (i) => `-path:f${i + 1}`)].join(" "));

    expect(parsed.excludedFolders).toHaveLength(10);
    expect(parsed.text).toBe("");
  });

  it("eight distinct excluded kinds are kept and the ninth is text", () => {
    const kinds = ["video", "image", "audio", "document", "archive", "other", "text", "pdf", "epub"];
    const parsed = parse(kinds.map((kind) => `-type:${kind}`).join(" "));

    expect(parsed.excludedTypes).toEqual(kinds.slice(0, 8));
    expect(parsed.text).toBe("-type:epub");
  });

  it("excluded tags have no cap", () => {
    const parsed = parse(range(25, (i) => `-tag:t${i}`).join(" "));

    expect(parsed.excludedTags).toHaveLength(25);
    expect(parsed.text).toBe("");
  });
});

describe("SPEC-CORE-172 parsing 5 hasOperators and the remaining text", () => {
  it.each(["-tag:x", "-has:tag", "has:collection", "-is:liked", "-in:C", "-path:A", "-type:pdf"])(
    "%s alone sets hasOperators and leaves no text",
    (q) => {
      expect(parse(q)).toMatchObject({ hasOperators: true, text: "" });
    },
  );

  it("the text is the tokens left as text", () => {
    expect(parse("京都  -tag:x  -京都 has:tag   寺").text).toBe("京都 -京都 寺");
  });
});

describe("SPEC-CORE-172 chips 1 one chip per operator, value and polarity", () => {
  it("in order of first appearance, positive and negated not grouped", () => {
    expect(operatorChips("-tag:a tag:b -tag:A has:tag -has:collection tag:B")).toHaveLength(4);
  });

  it("the same value in the other polarity is another chip", () => {
    expect(operatorChips("tag:x -tag:x")).toHaveLength(2);
    expect(operatorChips("is:favorite -is:favorite")).toHaveLength(2);
    expect(operatorChips("has:tag -has:tag")).toHaveLength(2);
    expect(operatorChips("path:A -path:A")).toHaveLength(2);
    expect(operatorChips("in:C -in:c")).toHaveLength(2);
    expect(operatorChips("type:pdf -type:pdf")).toHaveLength(2);
  });

  it("each new token produces a chip", () => {
    expect(
      operatorChips("-tag:a -type:pdf -path:A -in:C -is:favorite -is:liked has:tag -has:collection"),
    ).toHaveLength(8);
  });
});

describe("SPEC-CORE-172 I8 removing a chip removes exactly its own tokens", () => {
  it.each([
    ["a negated tag keeps the positive tag", "tag:x -tag:x -TAG:X 京都", 1, "tag:x 京都"],
    ["a positive tag keeps the negated tag", "tag:x -tag:x TAG:X 京都", 0, "-tag:x 京都"],
    ["a negated folder in every spelling", "-path:A path:A -path:/A/", 0, "path:A"],
    ["a negated collection case-insensitively", "-in:Trip in:Trip -in:trip", 0, "in:Trip"],
    ["a negated kind with its alias", "-type:markdown type:text -type:text", 0, "type:text"],
    ["has:tag keeps -has:tag", "has:tag -has:tag", 0, "-has:tag"],
    ["-has:collection keeps has:collection", "has:collection -has:collection 寺", 1, "has:collection 寺"],
    ["-is:favorite keeps is:favorite", "-is:favorite is:favorite", 0, "is:favorite"],
    ["-is:liked keeps a full-width spelling elsewhere", "-is:liked TAG：x", 0, "TAG：x"],
    ["a negated tag keeps a quoted value", '-tag:x path:"My Photos"', 0, 'path:"My Photos"'],
  ])("%s", (_name, q, index, expected) => {
    const next = removeOperatorChip(q, chipAt(q, index));

    expect(next).toBe(expected);
    expect(operatorChips(next)).toHaveLength(operatorChips(q).length - 1);
    expect(operatorChips(next).length).toBeGreaterThan(0);
  });
});

describe("SPEC-CORE-172 sending 4 the meaning filter", () => {
  it("carries each new condition under its key", () => {
    expect(
      wire('-tag:a -type:pdf -path:"My W" -in:C has:tag has:collection'),
    ).toMatchObject({
      exclude_tags: ["a"],
      exclude_kinds: ["pdf"],
      exclude_folders: ["My W"],
      exclude_collections: ["C"],
      has_tag: true,
      has_collection: true,
    });
  });

  it("writes false for -has:tag and -has:collection", () => {
    expect(wire("-has:tag -has:collection")).toEqual({ has_tag: false, has_collection: false });
  });

  it("carries favorite: false and liked: false for the negated flags", () => {
    expect(wire("-is:favorite -is:liked")).toEqual({ favorite: false, liked: false });
  });

  it("writes only the keys that are set, beside the existing ones", () => {
    expect(wire("tag:会議 -tag:2023 予算")).toEqual({ tags: ["会議"], exclude_tags: ["2023"] });
  });

  it("I1: a query with no new token writes the same filter as before", () => {
    expect(
      filterQueryParam(filterFromParsed(parseSearchQuery('tag:会議 type:pdf is:favorite path:"My Photos" in:旅行 予算'), null)),
    ).toBe(
      '{"tags":["会議"],"kinds":["pdf"],"favorite":true,"folders":["My Photos"],"collections":["旅行"]}',
    );
    expect(wire("-tag:x")).toEqual({ exclude_tags: ["x"] });
  });
});

describe("SPEC-CORE-172 value suggestions keep the `-`", () => {
  const tags = [
    { name: "旅館", count: 3 },
    { name: "旅行", count: 42 },
  ];

  it("-tag: suggests what tag: suggests and completing keeps the -", () => {
    const negated = activeOperatorValue("京都 -tag:旅");
    const positive = activeOperatorValue("京都 tag:旅");

    expect(negated).not.toBeNull();
    expect(suggestValues(negated!, tags, []).map((s) => s.value)).toEqual(
      suggestValues(positive!, tags, []).map((s) => s.value),
    );
    expect(completeOperator("京都 -tag:旅", negated!, "旅行")).toBe("京都 -tag:旅行 ");
  });

  it.each([
    ["-type:", "-type:p", "pdf", "-type:pdf "],
    ["-is:", "-is:f", "favorite", "-is:favorite "],
  ])("%s completes with the -", (_name, q, value, expected) => {
    const active = activeOperatorValue(q);

    expect(active).not.toBeNull();
    expect(suggestValues(active!, [], []).map((s) => s.value)).toContain(value);
    expect(completeOperator(q, active!, value)).toBe(expected);
  });

  it.each([
    ["has:", ["tag", "collection"]],
    ["-has:", ["tag", "collection"]],
    ["has:c", ["collection"]],
  ])("%s suggests %j", (q, expected) => {
    const active = activeOperatorValue(q);

    expect(active).not.toBeNull();
    expect(suggestValues(active!, [], []).map((s) => s.value).sort()).toEqual([...expected].sort());
  });

  it("completing -has: keeps the -", () => {
    const active = activeOperatorValue("京都 -has:");

    expect(completeOperator("京都 -has:", active!, "tag")).toBe("京都 -has:tag ");
  });
});
