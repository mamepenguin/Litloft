/**
 * SPEC-CORE-138 sending 5, I16: a Smart Collection holding `modified:` is not
 * usable as a Video or Reading app target, with or without free text.
 */

import { describe, expect, it } from "vitest";

import { resolveAppTarget } from "../appTarget";
import { READING_BASE_KINDS, resolveReadingTarget } from "../readingAppTarget";
import { resolveVideoTarget } from "../videoAppTarget";
import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

function folder(query: string): SmartFolder {
  return {
    id: "sf-1",
    drive: "main",
    name: "Old",
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

const QUERIES = [
  "modified:<1y",
  "modified:>=2024-06",
  "holiday modified:<1y",
  "tag:x modified:<2024 path:Downloads",
  "MODIFIED:<1y",
  "modified：＜１ｙ",
];

const BASES: readonly (readonly FileKind[])[] = [
  ["image"],
  ["video"],
  ["pdf", "epub", "archive"],
  READING_BASE_KINDS,
];

const UNSUPPORTED = { usable: false, reason: "unsupported_part" };

describe("SPEC-CORE-138 I16 the Video app refuses a modified: Smart Collection", () => {
  it.each(QUERIES)("%j", (query) => {
    expect(resolveVideoTarget(folder(query))).toEqual(UNSUPPORTED);
  });
});

describe("SPEC-CORE-138 I16 the Reading app refuses a modified: Smart Collection", () => {
  it.each(QUERIES)("%j", (query) => {
    expect(resolveReadingTarget(folder(query))).toEqual(UNSUPPORTED);
  });
});

describe("SPEC-CORE-138 I16 the shared resolver refuses it for every base", () => {
  for (const base of BASES) {
    it.each(QUERIES)(`%j (${base.join(",")})`, (query) => {
      expect(resolveAppTarget(folder(query), base)).toEqual(UNSUPPORTED);
    });
  }
});
