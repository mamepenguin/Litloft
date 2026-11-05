/**
 * SPEC-CORE-044: the `size:` and `duration:` range operators, their units and
 * comparisons, their chips and chip removal, and the filter the meaning stage
 * receives.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDriveFiles } from "../api";
import {
  filterFromParsed,
  filterQueryParam,
  operatorChips,
  parseSearchQuery,
  removeOperatorChip,
  type OperatorChip,
} from "../searchQuery";

const filterOf = (q: string) => filterFromParsed(parseSearchQuery(q), null);

const sizes = (q: string) => filterOf(q).sizes;

const durations = (q: string) => filterOf(q).durations;

const operators = (q: string) => operatorChips(q).map((chip) => chip.operator);

const chipOf = (q: string, index: number): OperatorChip => operatorChips(q)[index];

describe("SPEC-CORE-044 1.1 the value is NFKC-normalised before it is read", () => {
  it("reads full-width digits, letters and comparison signs", () => {
    expect(sizes("size:＞１ＧＢ")).toEqual(["gt:1073741824"]);
    expect(sizes("size:＞＝１ＧＢ")).toEqual(["gte:1073741824"]);
    expect(sizes("size:＜１ＧＢ")).toEqual(["lt:1073741824"]);
    expect(durations("duration:＞＝３０ｍ")).toEqual(["gte:1800"]);
  });

  it("reads a full-width colon as the operator colon", () => {
    expect(sizes("size：>1GB")).toEqual(["gt:1073741824"]);
    expect(durations("duration：>=30m")).toEqual(["gte:1800"]);
  });

  it("removes whitespace inside a quoted value", () => {
    expect(sizes('size:"> 1 GB"')).toEqual(["gt:1073741824"]);
    expect(sizes('size:"＞ １ Ｇ Ｂ"')).toEqual(["gt:1073741824"]);
    expect(durations('duration:">= 1 h 30 m"')).toEqual(["gte:5400"]);
  });
});

describe("SPEC-CORE-044 1.2 a value without a usable comparison is text", () => {
  it.each([
    ["no comparison", "size:1GB"],
    ["empty amount", "size:>"],
    ["an unparseable amount", "size:>big"],
    ["an unparseable duration", "duration:>1x"],
    ["seconds above 59 in a clock", "duration:>1:75"],
    ["a negative amount", "size:>-1"],
    ["an unknown unit", "size:>1X"],
    ["a lone unit", "duration:>h"],
  ])("keeps %s as its raw string", (_name, q) => {
    const parsed = parseSearchQuery(q);

    expect(parsed.sizes).toEqual([]);
    expect(parsed.durations).toEqual([]);
    expect(parsed.text).toBe(q);
    expect(parsed.hasOperators).toBe(false);
  });

  it("contributes the raw string as text beside a real operator", () => {
    expect(parseSearchQuery("size:1GB tag:x")).toMatchObject({
      text: "size:1GB",
      tags: ["x"],
      hasOperators: true,
    });
  });
});

describe("SPEC-CORE-044 I4 size amounts are binary multiples of bytes", () => {
  it.each([
    ["no unit", "size:>=1", "gte:1"],
    ["bytes", "size:>=1B", "gte:1"],
    ["lower-case bytes", "size:>=1b", "gte:1"],
    ["K", "size:>=1K", "gte:1024"],
    ["KB", "size:>=1KB", "gte:1024"],
    ["lower-case kb", "size:>=1kb", "gte:1024"],
    ["M", "size:>=1M", "gte:1048576"],
    ["MB", "size:>=1MB", "gte:1048576"],
    ["G", "size:>=1G", "gte:1073741824"],
    ["GB", "size:>=1GB", "gte:1073741824"],
    ["T", "size:>=1T", "gte:1099511627776"],
    ["TB", "size:>=1TB", "gte:1099511627776"],
  ])("%s", (_name, q, wire) => {
    expect(sizes(q)).toEqual([wire]);
  });

  it("1.5GB is 1610612736 bytes", () => {
    expect(sizes("size:>=1.5GB")).toEqual(["gte:1610612736"]);
  });

  it("rounds the product to the nearest byte, halves away from zero", () => {
    expect(sizes("size:>=0.1KB")).toEqual(["gte:102"]);
    expect(sizes("size:>=0.3KB")).toEqual(["gte:307"]);
    expect(sizes("size:>=1.4B")).toEqual(["gte:1"]);
    expect(sizes("size:>=0.5B")).toEqual(["gte:1"]);
    expect(sizes("size:>=2.5B")).toEqual(["gte:3"]);
    expect(sizes("size:>=90.4")).toEqual(["gte:90"]);
    expect(sizes("size:>=90.5")).toEqual(["gte:91"]);
  });

  it.each([
    ["a leading dot", "size:>=.5"],
    ["a trailing dot", "size:>=1."],
  ])("%s is text", (_name, q) => {
    expect(parseSearchQuery(q)).toMatchObject({ sizes: [], text: q });
  });

  it("keeps 2^53 - 1 bytes and turns 2^53 into text", () => {
    expect(sizes("size:>=9007199254740991B")).toEqual(["gte:9007199254740991"]);
    expect(sizes("size:>8192TB")).toEqual([]);
    expect(parseSearchQuery("size:>8192TB").text).toBe("size:>8192TB");
  });

  it("a size with a fraction rounds before it is written in the wire form", () => {
    expect(sizes("size:>90.4")).toEqual(["gt:90"]);
  });
});

describe("SPEC-CORE-044 I5 duration amounts are seconds", () => {
  it.each([
    ["bare seconds", "duration:>=90", "gte:90"],
    ["s", "duration:>=90s", "gte:90"],
    ["m and s", "duration:>=1m30s", "gte:90"],
    ["m:ss", "duration:>=1:30", "gte:90"],
    ["h:mm:ss", "duration:>=0:01:30", "gte:90"],
    ["h and m", "duration:>=1h30m", "gte:5400"],
    ["decimal hours", "duration:>=1.5h", "gte:5400"],
    ["decimal minutes", "duration:>=1.5m", "gte:90"],
  ])("%s", (_name, q, wire) => {
    expect(durations(q)).toEqual([wire]);
  });

  it("adds every part of a compound duration", () => {
    expect(durations("duration:>=2m30s")).toEqual(["gte:150"]);
    expect(durations("duration:>=1h30m30s")).toEqual(["gte:5430"]);
    expect(durations("duration:>=1H30M")).toEqual(["gte:5400"]);
    expect(durations("duration:>=1:05:00")).toEqual(["gte:3900"]);
  });

  it("rounds to three decimals", () => {
    expect(durations("duration:>1.23456")).toEqual(["gt:1.235"]);
    expect(durations("duration:>1.5")).toEqual(["gt:1.5"]);
  });

  it.each([
    ["parts out of order", "duration:>=30m1h"],
    ["seconds before minutes", "duration:>=1s2m"],
    ["a repeated unit", "duration:>=1h1h"],
    ["a number with no unit in a compound", "duration:>=1h30"],
    ["seconds of 60 in a clock", "duration:>=1:60"],
    ["minutes of 60 in a clock", "duration:>=1:60:00"],
    ["a one-digit clock second", "duration:>=1:5"],
    ["a one-digit clock minute", "duration:>=1:5:00"],
  ])("%s is text", (_name, q) => {
    expect(parseSearchQuery(q)).toMatchObject({ durations: [], text: q });
  });

  it("keeps 10,000,000 seconds and turns more into text", () => {
    expect(durations("duration:>=10000000")).toEqual(["gte:10000000"]);
    expect(durations("duration:>=10000000.001")).toEqual([]);
    expect(parseSearchQuery("duration:>=10000001").text).toBe(
      "duration:>=10000001",
    );
  });
});

describe("SPEC-CORE-044 1.5 the parsed lists", () => {
  it("keeps the comparisons in order of first appearance and sets hasOperators", () => {
    const parsed = parseSearchQuery(
      "size:>1GB duration:>=30m size:>1KB duration:<5m",
    );

    expect(parsed.sizes).toHaveLength(2);
    expect(parsed.durations).toHaveLength(2);
    expect(parsed.hasOperators).toBe(true);
    expect(filterOf("size:>1GB duration:>=30m size:>1KB duration:<5m")).toMatchObject({
      sizes: ["gt:1073741824", "gt:1024"],
      durations: ["gte:1800", "lt:300"],
    });
  });

  it("deduplicates by operator and number", () => {
    expect(sizes("size:>1GB size:>1024MB")).toEqual(["gt:1073741824"]);
    expect(sizes("size:>=1024 size:>=1KB")).toEqual(["gte:1024"]);
    expect(sizes("size:>1GB size:>=1GB")).toEqual([
      "gt:1073741824",
      "gte:1073741824",
    ]);
    expect(durations("duration:>=30m duration:>=1800s")).toEqual(["gte:1800"]);
  });

  it("turns the fifth distinct size comparison into text", () => {
    const q = ["size:>1B", "size:>2B", "size:>3B", "size:>4B", "size:>5B"].join(
      " ",
    );

    const parsed = parseSearchQuery(q);

    expect(parsed.sizes).toHaveLength(4);
    expect(parsed.text).toBe("size:>5B");
    expect(parsed.hasOperators).toBe(true);
  });

  it("turns the fifth distinct duration comparison into text", () => {
    const q = [
      "duration:>1s",
      "duration:>2s",
      "duration:>3s",
      "duration:>4s",
      "duration:>5s",
    ].join(" ");

    const parsed = parseSearchQuery(q);

    expect(parsed.durations).toHaveLength(4);
    expect(parsed.text).toBe("duration:>5s");
  });

  it("counts the cap after deduplication", () => {
    const q = [
      "size:>1B",
      "size:>2B",
      "size:>3B",
      "size:>4B",
      "size:>1",
    ].join(" ");

    const parsed = parseSearchQuery(q);

    expect(parsed.sizes).toHaveLength(4);
    expect(parsed.text).toBe("");
  });
});

describe("SPEC-CORE-044 1.6 an impossible range keeps its comparisons and chips", () => {
  it("keeps both sides of an impossible range so the user can remove one", () => {
    const bySize = "size:>1GB size:<500MB";
    const byDuration = "duration:>10m duration:<=10m";

    expect(sizes(bySize)).toEqual(["gt:1073741824", "lt:524288000"]);
    expect(durations(byDuration)).toEqual(["gt:600", "lte:600"]);
    expect(operatorChips(bySize)).toHaveLength(2);
    expect(operatorChips(byDuration)).toHaveLength(2);
  });
});

describe("SPEC-CORE-044 chips 1 one chip per distinct comparison", () => {
  it("follows the first appearance of each comparison", () => {
    expect(operators("size:>1GB duration:<5m size:>=1GB")).toEqual([
      "size",
      "duration",
      "size",
    ]);
  });

  it("produces one chip for two spellings of the same comparison", () => {
    expect(operatorChips("size:>1GB size:>1024MB")).toHaveLength(1);
    expect(operatorChips("duration:>=30m duration:>=1800s")).toHaveLength(1);
  });

  it("keeps the two sides of an impossible range apart", () => {
    expect(operatorChips("size:>1GB size:<500MB")).toHaveLength(2);
    expect(operatorChips("size:>1GB size:>=1GB")).toHaveLength(2);
  });
});

describe("SPEC-CORE-044 I9 removing a chip removes exactly its own tokens", () => {
  it("removes every token whose comparison equals the chip's", () => {
    const q = "a size:>1GB size:>1024MB b";

    const next = removeOperatorChip(q, chipOf(q, 0));

    expect(next).toBe("a b");
    expect(filterOf(next).sizes).toEqual([]);
  });

  it("leaves the other operator's tokens with their raw strings", () => {
    const q = 'tag:"two words" duration:>=30m size:<=500MB';

    const next = removeOperatorChip(q, chipOf(q, 2));

    expect(next).toBe('tag:"two words" duration:>=30m');
    expect(filterOf(next)).toMatchObject({
      tags: ["two words"],
      durations: ["gte:1800"],
      sizes: [],
    });
  });

  it("removes only the comparison that matches", () => {
    const q = "size:>1GB size:>=1GB";

    const next = removeOperatorChip(q, chipOf(q, 0));

    expect(next).toBe("size:>=1GB");
    expect(filterOf(next).sizes).toEqual(["gte:1073741824"]);
  });

  it("keeps an impossible range's other side", () => {
    const q = "size:>1GB size:<500MB";

    const next = removeOperatorChip(q, chipOf(q, 0));

    expect(next).toBe("size:<500MB");
  });

  it("removes a duration chip and keeps a size chip", () => {
    const q = "size:>1GB duration:<5m";

    const next = removeOperatorChip(q, chipOf(q, 1));

    expect(next).toBe("size:>1GB");
    expect(filterOf(next)).toMatchObject({
      sizes: ["gt:1073741824"],
      durations: [],
    });
  });

  it("keeps the case and the full-width colon of every other token", () => {
    const q = "TAG：x  size:<10MB";

    const next = removeOperatorChip(q, chipOf(q, 1));

    expect(next).toBe("TAG：x");
  });
});

describe("SPEC-CORE-044 sending 1 the filter the meaning stage receives", () => {
  it("copies sizes and durations in order", () => {
    expect(
      filterOf("size:>1GB size:<500MB duration:>=30m"),
    ).toMatchObject({
      sizes: ["gt:1073741824", "lt:524288000"],
      durations: ["gte:1800"],
    });
  });

  it("writes the new keys after the existing ones", () => {
    expect(
      filterQueryParam(
        filterOf("tag:会議 type:pdf is:favorite size:>1GB duration:>=30m"),
      ),
    ).toBe(
      '{"tags":["会議"],"kinds":["pdf"],"favorite":true,"sizes":["gt:1073741824"],"durations":["gte:1800"]}',
    );
  });

  it("writes them after folders and collections", () => {
    expect(
      filterQueryParam(
        filterOf('tag:会議 path:"My Photos" in:旅行 size:>1GB'),
      ),
    ).toBe(
      '{"tags":["会議"],"folders":["My Photos"],"collections":["旅行"],"sizes":["gt:1073741824"]}',
    );
  });

  it("omits each key when its list is empty", () => {
    expect(
      filterQueryParam(filterOf("tag:会議 size:>1GB")),
    ).toBe('{"tags":["会議"],"sizes":["gt:1073741824"]}');
    expect(
      filterQueryParam(filterOf("tag:会議 duration:<5m")),
    ).toBe('{"tags":["会議"],"durations":["lt:300"]}');
  });

  it("I11: a query without the new operators writes the same filter as before", () => {
    expect(
      filterQueryParam(
        filterOf('tag:会議 type:pdf is:favorite path:"My Photos" in:旅行 予算'),
      ),
    ).toBe(
      '{"tags":["会議"],"kinds":["pdf"],"favorite":true,"folders":["My Photos"],"collections":["旅行"]}',
    );
  });
});

describe("SPEC-CORE-044 sending 2 getDriveFiles writes the repeated parameters", () => {
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

  it("sends each wire form as a repeated size and duration parameter", async () => {
    await getDriveFiles("main", {
      search: "京都",
      size: ["gt:1073741824", "lt:524288000"],
      duration: ["gte:1800", "lt:300"],
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.getAll("size")).toEqual([
      "gt:1073741824",
      "lt:524288000",
    ]);
    expect(url.searchParams.getAll("duration")).toEqual(["gte:1800", "lt:300"]);
    expect(url.searchParams.has("path")).toBe(false);
  });

  it("I11: sends no size or duration parameter when there is none", async () => {
    await getDriveFiles("main", { search: "京都", tag: ["会議"], type: "pdf" });

    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.has("size")).toBe(false);
    expect(url.searchParams.has("duration")).toBe(false);
    expect(url.searchParams.getAll("tag")).toEqual(["会議"]);
  });
});
