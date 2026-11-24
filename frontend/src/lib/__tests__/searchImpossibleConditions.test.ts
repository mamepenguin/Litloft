/**
 * SPEC-CORE-172 the impossible combination: which queries can match no file,
 * and which combinations the spec sends although they look narrow.
 */

import { describe, expect, it } from "vitest";

import { hasImpossibleConditions, parseSearchQuery } from "../searchQuery";
import type { FileKind } from "@/types";

const impossible = (query: string, fixed: FileKind | null = null) =>
  hasImpossibleConditions(parseSearchQuery(query), fixed);

describe("SPEC-CORE-172 an impossible combination", () => {
  it.each([
    ["a tag in both polarities", "tag:Trip -tag:trip", null],
    ["untagged with any tag", "-has:tag tag:x", null],
    ["untagged with has:tag", "-has:tag has:tag", null],
    ["favorite in both polarities", "is:favorite -is:favorite", null],
    ["liked in both polarities", "is:liked -is:liked", null],
    ["in a collection and in none", "has:collection -has:collection", null],
    ["a kind excluded by itself", "type:video -type:video", null],
    ["a kind held by an excluded kind", "type:pdf -type:document", null],
    ["the page's fixed kind excluded", "-type:image", "image"],
    ["a folder inside an excluded folder", "path:A/b -path:A", null],
    ["sibling folders both excluded", "path:A path:B -path:A -path:B/c -path:B", null],
    ["a collection in both polarities", "in:Trip -in:trip", null],
  ] as const)("%s", (_name, query, fixed) => {
    expect(impossible(query, fixed as FileKind | null)).toBe(true);
  });

  it.each([
    ["in:x -has:collection", "in:Trip -has:collection", null],
    ["type:document -type:pdf", "type:document -type:pdf", null],
    ["path:A -path:A/b", "path:A -path:A/b", null],
    ["a sibling folder whose name starts with the excluded one", "path:AB -path:A", null],
    ["a tag beside another excluded tag", "tag:x -tag:y", null],
    ["a kind beside another excluded kind", "type:video -type:image", null],
    ["a folder outside the excluded one", "path:B -path:A", null],
    ["a collection beside another excluded collection", "in:Trip -in:Work", null],
  ] as const)("%s is not impossible", (_name, query, fixed) => {
    expect(impossible(query, fixed as FileKind | null)).toBe(false);
  });

  it("a query with no new token is never impossible", () => {
    expect(impossible("tag:x type:pdf path:A in:Trip hasOperators")).toBe(false);
  });
});
