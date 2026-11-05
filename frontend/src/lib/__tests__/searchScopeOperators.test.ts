/**
 * SPEC-CORE-043: the tokenizer with quoted values, the `path:` and `in:`
 * operators, their chips, and the filter the meaning stage receives.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDriveFiles } from "../api";
import {
  activeOperatorValue,
  closeOpenQuote,
  completeOperator,
  filterFromParsed,
  filterQueryParam,
  operatorChips,
  parseSearchQuery,
  removeOperatorChip,
  type OperatorChip,
} from "../searchQuery";

const operators = (q: string) => operatorChips(q).map((chip) => chip.operator);

const chipOf = (q: string, index: number): OperatorChip => operatorChips(q)[index];

const paths = (q: string) => parseSearchQuery(q).folders;

const collections = (q: string) => parseSearchQuery(q).collections;

describe("SPEC-CORE-043 tokenizer", () => {
  it("item 1: a quoted value keeps its whitespace and the quotes are not part of it", () => {
    expect(parseSearchQuery('path:"My Photos/2024" tag:x')).toMatchObject({
      folders: ["My Photos/2024"],
      tags: ["x"],
      text: "",
      hasOperators: true,
    });
  });

  it("item 1: a full-width quote and colon read as a quote and colon", () => {
    expect(paths("path：＂My Photos＂")).toEqual(["My Photos"]);
  });

  it("item 1: whitespace inside the quotes does not split, U+3000 included", () => {
    expect(collections('in:"読書　メモ"')).toEqual(["読書　メモ"]);
    expect(parseSearchQuery('in:"読書　メモ"')).toMatchObject({ text: "" });
  });

  it("item 1: characters after the closing quote start a new token", () => {
    expect(parseSearchQuery('path:"My Photos"x')).toMatchObject({
      folders: ["My Photos"],
      text: "x",
    });
  });

  it("item 1: an unterminated quote runs to the end of the query", () => {
    expect(parseSearchQuery('path:"My Ph')).toMatchObject({
      folders: ["My Ph"],
      text: "",
    });
  });

  it("item 1: whitespace outside quotes still splits tokens", () => {
    expect(parseSearchQuery("path:a b")).toMatchObject({
      folders: ["a"],
      text: "b",
    });
  });

  it("item 3: a quote is special only after the colon of a name-form token", () => {
    expect(parseSearchQuery('"meeting notes"')).toMatchObject({
      text: '"meeting notes"',
      hasOperators: false,
      folders: [],
      collections: [],
    });
    expect(parseSearchQuery('path:"My Photos" "meeting notes"')).toMatchObject({
      folders: ["My Photos"],
      text: '"meeting notes"',
    });
  });

  it("item 2: an unknown name keeps its raw string as text beside a quoted value", () => {
    expect(parseSearchQuery('name:2024 path:"My Photos" tag:x')).toMatchObject({
      text: "name:2024",
      folders: ["My Photos"],
      tags: ["x"],
    });
  });

  it("item 2: an unusable value keeps its raw string as text", () => {
    expect(parseSearchQuery("type:movie 京都")).toMatchObject({
      text: "type:movie 京都",
      types: [],
      hasOperators: false,
    });
    expect(parseSearchQuery("path:/ tag:x")).toMatchObject({
      text: "path:/",
      folders: [],
      tags: ["x"],
    });
  });

  it("item 2: text tokens are their raw strings joined with single spaces", () => {
    expect(parseSearchQuery('path:"My Photos"   tag:x  b')).toMatchObject({
      text: "b",
      folders: ["My Photos"],
      tags: ["x"],
    });
  });

  it.each([
    ["empty quotes", 'in:""'],
    ["path alone", "path:"],
    ["in alone", "in:"],
  ])("item 5: %s is text", (_name, q) => {
    const parsed = parseSearchQuery(q);

    expect(parsed.text).toBe(q);
    expect(parsed.folders).toEqual([]);
    expect(parsed.collections).toEqual([]);
    expect(parsed.hasOperators).toBe(false);
  });

  it("item 4: every operator reads its value through the same tokenizer", () => {
    expect(parseSearchQuery('tag:"two words"')).toMatchObject({
      tags: ["two words"],
      text: "",
    });
  });

  it("path 1: the value is NFC-normalised and trimmed of slashes", () => {
    expect(paths("path:/Photos/Cafe\u0301/")).toEqual(["Photos/Café"]);
  });

  it.each([
    ["root", "path:/"],
    ["empty segment", "path:a//b"],
    ["dot segment", "path:a/./b"],
    ["dot", "path:."],
    ["dot-dot", "path:.."],
    ["dot-dot segment", "path:a/../b"],
    ["nul", "path:a\u0000b"],
  ])("path 1: a %s value is text", (_name, q) => {
    const parsed = parseSearchQuery(`${q} tag:x`);

    expect(parsed.folders).toEqual([]);
    expect(parsed.text).toBe(q);
    expect(parsed.tags).toEqual(["x"]);
  });

  it("path 2: duplicates count once", () => {
    expect(parseSearchQuery("path:a path:/a")).toMatchObject({
      folders: ["a"],
      text: "",
    });
  });

  it("in 1: collection names are trimmed and deduplicated case-insensitively", () => {
    expect(collections('in:"  Trip  " in:trip in:Work')).toEqual(["Trip", "Work"]);
  });

  it("path 3 and in 3: both operators set hasOperators", () => {
    expect(parseSearchQuery("path:a").hasOperators).toBe(true);
    expect(parseSearchQuery("in:a").hasOperators).toBe(true);
  });

  it("returns empty folders and collections for an empty query", () => {
    expect(parseSearchQuery("")).toMatchObject({ folders: [], collections: [] });
  });
});

describe("SPEC-CORE-043 I5 the tokenizer is shared by parse, chips and removal", () => {
  it("one quoted folder is one folder and no text word", () => {
    const parsed = parseSearchQuery('path:"My Photos"');

    expect(parsed.folders).toEqual(["My Photos"]);
    expect(parsed.text).toBe("");
    expect(parsed.text).not.toContain("Photos");
  });

  it("the chips follow the first appearance of each operator", () => {
    expect(operators('in:Trip path:"My Photos" tag:x path:Work')).toEqual([
      "collection",
      "path",
      "tag",
      "path",
    ]);
  });

  it("a chip is produced once per distinct value", () => {
    expect(operatorChips("path:a path:a path:b")).toHaveLength(2);
    expect(operatorChips("in:Trip in:trip in:Work")).toHaveLength(2);
  });

  it("removing a path chip leaves the other tokens' raw strings", () => {
    const q = 'a  path:"My Photos"   tag:x  b';

    const next = removeOperatorChip(q, chipOf(q, 0));

    expect(next).toBe("a tag:x b");
    expect(parseSearchQuery(next)).toMatchObject({ tags: ["x"], text: "a b" });
  });

  it("removing a path chip drops every token that produced it", () => {
    const q = "path:Photos/ path:/Photos tag:x";

    const next = removeOperatorChip(q, chipOf(q, 0));

    expect(next).toBe("tag:x");
    expect(parseSearchQuery(next)).toMatchObject({ folders: [], tags: ["x"] });
  });

  it("removing a tag chip leaves a quoted path unchanged", () => {
    const q = 'path:"My Photos" tag:x';

    const next = removeOperatorChip(q, chipOf(q, 1));

    expect(next).toBe('path:"My Photos"');
    expect(parseSearchQuery(next)).toMatchObject({
      folders: ["My Photos"],
      tags: [],
    });
  });

  it("removing a collection chip matches the name case-insensitively", () => {
    const q = "in:Trip in:trip in:Work";

    const next = removeOperatorChip(q, chipOf(q, 0));

    expect(next).toBe("in:Work");
    expect(parseSearchQuery(next)).toMatchObject({ collections: ["Work"] });
  });
});

describe("SPEC-CORE-043 item 8 caps counted in code points", () => {
  it("a folder of 1024 code points is accepted and 1025 is text", () => {
    const at = "a".repeat(1024);
    const over = "a".repeat(1025);

    expect(paths(`path:${at}`)).toEqual([at]);
    expect(parseSearchQuery(`path:${over}`)).toMatchObject({
      folders: [],
      text: `path:${over}`,
    });
  });

  it("an astral character counts as one code point, not two UTF-16 units", () => {
    const at = "😀".repeat(1024);
    const over = "😀".repeat(1025);

    expect(paths(`path:${at}`)).toEqual([at]);
    expect(parseSearchQuery(`path:${over}`)).toMatchObject({ folders: [] });
  });

  it("the folder cap is applied after trimming the slashes", () => {
    const at = "a".repeat(1024);

    expect(paths(`path:/${at}/`)).toEqual([at]);
  });

  it("a collection name of 100 code points is accepted and 101 is text", () => {
    const at = "😀".repeat(100);
    const over = "😀".repeat(101);

    expect(collections(`in:${at}`)).toEqual([at]);
    expect(parseSearchQuery(`in:${over}`)).toMatchObject({
      collections: [],
      text: `in:${over}`,
    });
  });

  it("the collection cap is applied after trimming", () => {
    const at = "c".repeat(100);

    expect(collections(`in:"  ${at}  "`)).toEqual([at]);
    expect(collections(`in:"  ${at}c  "`)).toEqual([]);
  });

  it("ten distinct folders are kept and the eleventh is text", () => {
    const q = [...Array.from({ length: 10 }, (_, i) => `path:f${i}`), "path:f10"].join(
      " ",
    );

    const parsed = parseSearchQuery(q);

    expect(parsed.folders).toEqual(Array.from({ length: 10 }, (_, i) => `f${i}`));
    expect(parsed.text).toBe("path:f10");
    expect(parsed.hasOperators).toBe(true);
  });

  it("ten distinct collections are kept and the eleventh is text", () => {
    const q = [...Array.from({ length: 10 }, (_, i) => `in:c${i}`), "in:c10"].join(
      " ",
    );

    const parsed = parseSearchQuery(q);

    expect(parsed.collections).toEqual(Array.from({ length: 10 }, (_, i) => `c${i}`));
    expect(parsed.text).toBe("in:c10");
  });

  it("the cap counts distinct values, not raw tokens", () => {
    const q = [
      ...Array.from({ length: 10 }, (_, i) => `path:f${i}`),
      "path:f0",
      "path:/f1/",
      ...Array.from({ length: 10 }, (_, i) => `in:c${i}`),
      "in:C0",
    ].join(" ");

    const parsed = parseSearchQuery(q);

    expect(parsed.folders).toHaveLength(10);
    expect(parsed.collections).toHaveLength(10);
    expect(parsed.text).toBe("");
  });
});

describe("SPEC-CORE-043 combining: the filter the meaning stage receives", () => {
  it("filterFromParsed copies folders and collections in order", () => {
    const parsed = parseSearchQuery('path:"My Photos" path:Work in:旅行 in:資料 予算');

    expect(filterFromParsed(parsed, null)).toEqual({
      tags: [],
      kinds: [],
      favorite: false,
      liked: false,
      folders: ["My Photos", "Work"],
      collections: ["旅行", "資料"],
      sizes: [],
      durations: [],
    });
  });

  it("filterQueryParam writes the new keys after the existing ones and omits them when empty", () => {
    const filter = {
      tags: ["会議"],
      kinds: ["pdf" as const],
      favorite: true,
      liked: true,
      folders: ["My Photos"],
      collections: ["旅行"],
      sizes: [],
      durations: [],
    };

    expect(filterQueryParam(filter)).toBe(
      '{"tags":["会議"],"kinds":["pdf"],"favorite":true,"liked":true,"folders":["My Photos"],"collections":["旅行"]}',
    );

    expect(
      filterQueryParam(filterFromParsed(parseSearchQuery("tag:会議"), null)),
    ).toBe('{"tags":["会議"]}');
  });

  it("I8: a query without the new operators writes the same filter as before", () => {
    const parsed = parseSearchQuery("tag:会議 type:pdf is:favorite 予算");

    expect(filterQueryParam(filterFromParsed(parsed, null))).toBe(
      '{"tags":["会議"],"kinds":["pdf"],"favorite":true}',
    );
  });
});

describe("SPEC-CORE-043 I13 activeOperatorValue inside an open quote", () => {
  it("offers no value inside an open quote and still offers one outside", () => {
    expect(activeOperatorValue('tag:"two')).toBeNull();
    expect(activeOperatorValue('tag:"two wo')).toBeNull();
    expect(activeOperatorValue('path:"My Ph')).toBeNull();
    expect(activeOperatorValue('x in:"読書 メ')).toBeNull();

    expect(activeOperatorValue("tag:tw")).toMatchObject({
      operator: "tag",
      partial: "tw",
      replaceFrom: 0,
    });
    expect(activeOperatorValue("x path:a")).toBeNull();
  });
});

describe("SPEC-CORE-043 item 6 the writer quotes a value with whitespace", () => {
  const active = { operator: "tag" as const, partial: "tw", replaceFrom: 0 };

  it("quotes a value with a space and writes a value without whitespace bare", () => {
    expect(completeOperator("", active, "two words")).toBe('tag:"two words" ');
    expect(completeOperator("", active, "travel")).toBe("tag:travel ");
  });

  it("keeps the text before the token being typed", () => {
    expect(completeOperator("予算 tw", { ...active, replaceFrom: 3 }, "two words")).toBe(
      '予算 tag:"two words" ',
    );
  });
});

describe("SPEC-CORE-043 listing 1 getDriveFiles writes the new parameters", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { total: 0, page: 1, limit: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends each folder and collection as a repeated parameter", async () => {
    await getDriveFiles("main", {
      search: "京都",
      folder: ["My Photos", "Work/2024"],
      collection: ["旅行", "資料"],
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.get("search")).toBe("京都");
    expect(url.searchParams.getAll("folder")).toEqual(["My Photos", "Work/2024"]);
    expect(url.searchParams.getAll("collection")).toEqual(["旅行", "資料"]);
    expect(url.searchParams.has("path")).toBe(false);
    expect(url.searchParams.has("recursive")).toBe(false);
  });
});

describe("SPEC-CORE-043 I12 removing a chip removes exactly its own tokens", () => {
  it("removing the favorites chip leaves an is:liked token and the text", () => {
    expect(
      removeOperatorChip("is:favorite is:liked tag:x 京都", {
        operator: "is",
        flag: "favorite",
      }),
    ).toBe("is:liked tag:x 京都");
  });

  it("removing one folder chip leaves the other path: token", () => {
    expect(
      removeOperatorChip("path:A path:B", { operator: "path", folder: "A" }),
    ).toBe("path:B");
  });

  it("removing a collection chip leaves another operator's tokens", () => {
    expect(
      removeOperatorChip("in:Trip tag:x path:a", {
        operator: "collection",
        collection: "trip",
      }),
    ).toBe("tag:x path:a");
  });

  it("keeps every other token's raw string, case and spacing unchanged", () => {
    expect(
      removeOperatorChip('TAG：x path:"a" in:Trip', {
        operator: "collection",
        collection: "Trip",
      }),
    ).toBe('TAG：x path:"a"');
  });
});

describe("SPEC-CORE-043 rule 7 a menu choice closes an open quote only", () => {
  it("an empty or whitespace-only field has nothing to close", () => {
    expect(closeOpenQuote("")).toBe("");
    expect(closeOpenQuote("  ")).toBe("  ");
  });
});

describe("SPEC-CORE-043 I10 repeated slashes at either end are trimmed", () => {
  it("path://Work// is the folder Work", () => {
    expect(parseSearchQuery("path://Work//").folders).toEqual(["Work"]);
    expect(parseSearchQuery("path://Work//").text).toBe("");
  });
});

describe("SPEC-CORE-043 rule 8 the cap counts distinct values in order", () => {
  it("a duplicate before the tenth distinct folder does not spend the cap", () => {
    const q = [
      "path:f0",
      "path:f0",
      ...Array.from({ length: 9 }, (_, i) => `path:f${i + 1}`),
    ].join(" ");

    const parsed = parseSearchQuery(q);

    expect(parsed.folders).toEqual(Array.from({ length: 10 }, (_, i) => `f${i}`));
    expect(parsed.text).toBe("");
  });

  it("a duplicate before the tenth distinct collection does not spend the cap", () => {
    const q = [
      "in:C0",
      "in:c0",
      ...Array.from({ length: 9 }, (_, i) => `in:c${i + 1}`),
    ].join(" ");

    const parsed = parseSearchQuery(q);

    expect(parsed.collections).toEqual(["C0", ...Array.from({ length: 9 }, (_, i) => `c${i + 1}`)]);
    expect(parsed.text).toBe("");
  });
});

describe("SPEC-CORE-043 I5 a repeated is: value is one chip", () => {
  it("is:favorite is:favorite produces a single chip", () => {
    expect(operatorChips("is:favorite is:favorite")).toHaveLength(1);
  });
});

describe("SPEC-CORE-043 item 1 a token that starts with a colon is text", () => {
  it("keeps the raw string and does not open a quote", () => {
    expect(parseSearchQuery(':"a  b" tag:x').text).toBe(':"a b"');
    expect(parseSearchQuery(':"a  b" tag:x').folders).toEqual([]);
    expect(parseSearchQuery(':"a  b" tag:x').tags).toEqual(["x"]);
    expect(closeOpenQuote(':"abc')).toBe(':"abc');
  });
});

describe("SPEC-CORE-043 I5 rule 1 mixed half- and full-width quotes pair", () => {
  it("a full-width quote closes on a half-width one", () => {
    expect(parseSearchQuery('path:＂My Photos" tag:x')).toMatchObject({
      folders: ["My Photos"],
      tags: ["x"],
      text: "",
    });
  });

  it("a half-width quote closes on a full-width one", () => {
    expect(parseSearchQuery('in:"読書 メモ＂ 京都')).toMatchObject({
      collections: ["読書 メモ"],
      text: "京都",
    });
  });
});

describe("SPEC-CORE-043 I2 case-variant folders stay distinct in chips and removal", () => {
  it("path:Photos and path:photos are two chips and removal is case-sensitive", () => {
    expect(operatorChips("path:Photos path:photos")).toHaveLength(2);
    expect(
      removeOperatorChip("path:Photos path:photos", {
        operator: "path",
        folder: "Photos",
      }),
    ).toBe("path:photos");
  });
});

describe("SPEC-CORE-043 item 3 a quote inside free text is an ordinary character", () => {
  it("does not group free text and keeps the bare value of a name-form token", () => {
    const parsed = parseSearchQuery('"budget tag:x"');

    expect(parsed.text).toBe('"budget');
    expect(parsed.tags).toEqual(['x"']);
    expect(parseSearchQuery('path:a "foo  bar"').text).toBe('"foo bar"');
  });
});
