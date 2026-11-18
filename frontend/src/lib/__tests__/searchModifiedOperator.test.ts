/**
 * SPEC-CORE-138: parsing `modified:`, its token identity and cap, and its
 * chips and chip removal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDriveFiles } from "../api";

import {
  operatorChips,
  parseSearchQuery,
  removeOperatorChip,
  type OperatorChip,
} from "../searchQuery";

const modifiedOf = (q: string): unknown[] | undefined =>
  (parseSearchQuery(q) as unknown as { modified?: unknown[] }).modified;

const modifiedChips = (q: string): OperatorChip[] =>
  operatorChips(q).filter((chip) => chip.operator === ("modified" as OperatorChip["operator"]));

describe("SPEC-CORE-138 parsing 1-3 a value that does not parse is text", () => {
  it.each([
    ["no comparison", "modified:2024"],
    ["a word", "modified:<yesterday"],
    ["a day that does not exist", "modified:<2023-02-30"],
    ["the 29th of February in a common year", "modified:<2023-02-29"],
    ["an hour unit", "modified:<1h"],
    ["a leading zero on a relative amount", "modified:<030d"],
    ["a zero relative amount", "modified:<0d"],
    ["a fractional relative amount", "modified:<1.5y"],
    ["mixed separators", "modified:<2024/01-05"],
    ["a five-digit year", "modified:<02024"],
    ["a two-digit year", "modified:<24-01"],
    ["a year before 1970", "modified:<1969"],
    ["month 13", "modified:<2024-13"],
    ["month 0", "modified:<2024-00"],
    ["a three-digit month", "modified:<2024-001"],
    ["day 0", "modified:<2024-01-00"],
    ["an equals sign", "modified:=2024"],
    ["an empty amount", "modified:<"],
    ["a time of day", "modified:<2024-01-01T12:00"],
    ["more than 36,500 days", "modified:<36501d"],
    ["101 years", "modified:<101y"],
    ["5,215 weeks", "modified:<5215w"],
    ["1,217 months", "modified:<1217m"],
  ])("%s stays its raw string", (_name, q) => {
    const parsed = parseSearchQuery(q);

    expect(modifiedOf(q)).toEqual([]);
    expect(parsed.text).toBe(q);
    expect(parsed.hasOperators).toBe(false);
  });
});

describe("SPEC-CORE-138 parsing 1-3 the accepted amounts", () => {
  it.each([
    ["a year", "modified:<2024"],
    ["a month with a dash", "modified:>=2024-06"],
    ["a one-digit month and day", "modified:<2024-6-5"],
    ["slashes throughout", "modified:<2024/06/05"],
    ["the 29th of February in a leap year", "modified:>2024-02-29"],
    ["1970", "modified:>=1970"],
    ["9999", "modified:<=9999"],
    ["days", "modified:>=30d"],
    ["weeks", "modified:<2w"],
    ["months", "modified:<6m"],
    ["years", "modified:<1y"],
    ["an upper-case unit", "modified:>=30D"],
    ["36,500 days", "modified:<36500d"],
    ["100 years", "modified:<100y"],
    ["5,214 weeks", "modified:<5214w"],
    ["1,216 months", "modified:<1216m"],
    ["full-width characters", "modified:＜１ｙ"],
    ["a full-width colon", "modified：<1y"],
    ["whitespace inside a quoted value", 'modified:"< 2024 - 01"'],
  ])("%s is one comparison and sets hasOperators", (_name, q) => {
    const parsed = parseSearchQuery(q);

    expect(modifiedOf(q)).toHaveLength(1);
    expect(parsed.text).toBe("");
    expect(parsed.hasOperators).toBe(true);
  });

  it("leaves free text beside the comparison", () => {
    const parsed = parseSearchQuery("modified:<1y 京都 modified:2024");

    expect(modifiedOf("modified:<1y 京都 modified:2024")).toHaveLength(1);
    expect(parsed.text).toBe("京都 modified:2024");
  });
});

describe("SPEC-CORE-138 parsing 4 identity, deduplication and the cap", () => {
  it("treats the separator, zero padding and unit case as one identity", () => {
    expect(modifiedOf("modified:<2024/1 modified:<2024-01 modified:<2024/01")).toHaveLength(1);
    expect(modifiedOf("modified:>=30D modified:>=30d")).toHaveLength(1);
    expect(modifiedOf("modified:<2024-6-5 modified:<2024/06/05")).toHaveLength(1);
  });

  it("keeps two spellings of the same comparison apart when their identities differ", () => {
    expect(modifiedOf("modified:<2024 modified:<=2023")).toHaveLength(2);
    expect(modifiedOf("modified:<1y modified:<365d")).toHaveLength(2);
    expect(modifiedOf("modified:<1y modified:>=1y")).toHaveLength(2);
  });

  it("turns the fifth distinct token into text", () => {
    const q = "modified:<1d modified:<2d modified:<3d modified:<4d modified:<5d";

    const parsed = parseSearchQuery(q);

    expect(modifiedOf(q)).toHaveLength(4);
    expect(parsed.text).toBe("modified:<5d");
    expect(parsed.hasOperators).toBe(true);
  });

  it("counts the cap after deduplication", () => {
    const q = "modified:<1d modified:<2d modified:<3d modified:<4d modified:<1D";

    expect(modifiedOf(q)).toHaveLength(4);
    expect(parseSearchQuery(q).text).toBe("");
  });

  it("keeps both sides of an impossible range as tokens", () => {
    expect(modifiedOf("modified:>2024 modified:<2023")).toHaveLength(2);
    expect(modifiedChips("modified:>2024 modified:<2023")).toHaveLength(2);
  });
});

describe("SPEC-CORE-138 chips one chip per identity", () => {
  it("makes one chip per distinct identity, in order of first appearance", () => {
    const chips = modifiedChips("modified:<2024/1 size:>1GB modified:<2024-01 modified:<=2023");

    expect(chips).toHaveLength(2);
    expect(operatorChips("modified:<2024/1 size:>1GB modified:<2024-01 modified:<=2023").map((c) => c.operator)).toEqual([
      "modified",
      "size",
      "modified",
    ]);
  });
});

describe("SPEC-CORE-138 I12 removing a chip removes exactly its identity's tokens", () => {
  it("removes every spelling of that identity and nothing else", () => {
    const q = "a modified:<2024/1 modified:<2024-01 modified:<=2023 b";

    const next = removeOperatorChip(q, modifiedChips(q)[0]);

    expect(next).toBe("a modified:<=2023 b");
    expect(modifiedOf(next)).toHaveLength(1);
  });

  it("keeps the other identity that resolves to the same comparison", () => {
    const q = "modified:<2024 modified:<=2023";

    const next = removeOperatorChip(q, modifiedChips(q)[1]);

    expect(next).toBe("modified:<2024");
  });

  it("keeps every other token's raw string", () => {
    const q = 'TAG：x path:"My Photos" modified:>=30D size:<10MB';

    const next = removeOperatorChip(q, modifiedChips(q)[0]);

    expect(next).toBe('TAG：x path:"My Photos" size:<10MB');
  });

  it("removes one side of an impossible range and keeps the other", () => {
    const q = "modified:>2024 modified:<2023";

    const next = removeOperatorChip(q, modifiedChips(q)[0]);

    expect(next).toBe("modified:<2023");
  });
});

describe("SPEC-CORE-138 sending 2 the listing gets a repeated modified parameter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () =>
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

  it("writes each wire form, and none when there is none (I10)", async () => {
    await getDriveFiles("main", {
      search: "京都",
      modified: ["gte:1717167600", "lt:1719759600"],
    } as Parameters<typeof getDriveFiles>[1]);
    await getDriveFiles("main", { search: "京都", tag: ["会議"] });

    const withModified = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    const without = new URL(String(fetchMock.mock.calls[1][0]), "http://localhost");
    expect(withModified.searchParams.getAll("modified")).toEqual(["gte:1717167600", "lt:1719759600"]);
    expect(without.searchParams.has("modified")).toBe(false);
    expect(without.searchParams.getAll("tag")).toEqual(["会議"]);
  });
});
