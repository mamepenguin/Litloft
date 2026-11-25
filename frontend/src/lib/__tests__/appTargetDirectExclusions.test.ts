/**
 * SPEC-CORE-177: a Smart Collection whose query holds an exclusion or a `has:`
 * token, and no free text, resolves to a direct target that carries them as
 * listing keys. Keys are read from the wire form the listing requests send.
 */

import { describe, expect, it } from "vitest";

import { resolveAppTarget } from "../appTarget";
import { appendListingFilters, type ListingFilters } from "../listingRequest";
import { resolveMemberTarget } from "../memberTarget";
import { READING_BASE_KINDS, resolveReadingMemberTarget, resolveReadingTarget } from "../readingAppTarget";
import { evaluateSmartCollection, type SmartCollectionEvalIo } from "../smartCollectionEval";
import { resolveVideoMemberTarget, resolveVideoTarget } from "../videoAppTarget";
import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

function folder(query: string, fileType: SmartFolder["file_type"] = null): SmartFolder {
  return {
    id: "sf-1",
    drive: "main",
    name: "Smart",
    query,
    file_type: fileType,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

type Resolved = { usable: boolean; params?: unknown; empty?: boolean; reason?: string };

function wireOf(target: Resolved): URLSearchParams {
  if (!target.usable || target.params === null || target.params === undefined) {
    throw new Error(`not a usable target with params: ${JSON.stringify(target)}`);
  }
  const out = new URLSearchParams();
  appendListingFilters(out, target.params as ListingFilters);
  return out;
}

const EMPTY = { usable: true, empty: true, params: null };
const ALL_KEYS =
  "tag:Trip -tag:draft -type:image -path:Work/ -in:Old -is:favorite -is:liked has:tag -has:collection";

function expectAllKeys(wire: URLSearchParams) {
  expect(wire.getAll("tag")).toEqual(["Trip"]);
  expect(wire.getAll("exclude_tag")).toEqual(["draft"]);
  expect(wire.getAll("exclude_type")).toEqual(["image"]);
  expect(wire.getAll("exclude_folder")).toEqual(["Work"]);
  expect(wire.getAll("exclude_collection")).toEqual(["Old"]);
  expect(wire.getAll("favorite")).toEqual(["false"]);
  expect(wire.getAll("liked")).toEqual(["false"]);
  expect(wire.getAll("has_tag")).toEqual(["true"]);
  expect(wire.getAll("has_collection")).toEqual(["false"]);
  expect(wire.getAll("search")).toEqual([]);
}

const SINGLE_TOKENS: [string, string, string[]][] = [
  ["-tag:draft", "exclude_tag", ["draft"]],
  ["-tag:a -tag:b", "exclude_tag", ["a", "b"]],
  ["-path:Work/", "exclude_folder", ["Work"]],
  ["-path:/A/b/", "exclude_folder", ["A/b"]],
  ["-path:レシピ", "exclude_folder", ["レシピ"]],
  ["-in:Trip", "exclude_collection", ["Trip"]],
  ["-is:favorite", "favorite", ["false"]],
  ["-is:liked", "liked", ["false"]],
  ["has:tag", "has_tag", ["true"]],
  ["-has:tag", "has_tag", ["false"]],
  ["has:collection", "has_collection", ["true"]],
  ["-has:collection", "has_collection", ["false"]],
];

describe("SPEC-CORE-177 step 2 Video carries each new token as its listing key", () => {
  it.each(SINGLE_TOKENS)("SPEC-CORE-177 %j sends %s=%j", (query, key, values) => {
    const wire = wireOf(resolveVideoTarget(folder(query)));

    expect(wire.getAll(key)).toEqual(values);
    expect(wire.getAll("type")).toEqual(["video"]);
    expect(wire.getAll("search")).toEqual([]);
  });

  it("SPEC-CORE-177 carries all eight keys alongside the query's tag", () => {
    const wire = wireOf(resolveVideoTarget(folder(ALL_KEYS)));

    expectAllKeys(wire);
    expect(wire.getAll("type")).toEqual(["video"]);
  });

  it("SPEC-CORE-177 I7 keeps duration as a listing key next to an exclusion", () => {
    const wire = wireOf(resolveVideoTarget(folder("-path:Work duration:>10m")));

    expect(wire.getAll("duration")).toEqual(["gt:600"]);
    expect(wire.getAll("exclude_folder")).toEqual(["Work"]);
  });
});

const BASES: readonly (readonly FileKind[])[] = [
  ["image"],
  ["video"],
  READING_BASE_KINDS,
  ["image", "video", "audio", "text", "other"],
];

describe("SPEC-CORE-177 step 2 resolveAppTarget carries each new token as its listing key", () => {
  for (const base of BASES) {
    it.each(SINGLE_TOKENS)(`SPEC-CORE-177 %j sends %s=%j (${base.join(",")})`, (query, key, values) => {
      const wire = wireOf(resolveAppTarget(folder(query), base));

      expect(wire.getAll(key)).toEqual(values);
      expect([...wire.getAll("type")].sort()).toEqual([...base].sort());
      expect(wire.getAll("search")).toEqual([]);
    });
  }

  it("SPEC-CORE-177 carries all eight keys for Reading", () => {
    const wire = wireOf(resolveReadingTarget(folder(ALL_KEYS)));

    expectAllKeys(wire);
    expect([...wire.getAll("type")].sort()).toEqual([...READING_BASE_KINDS].sort());
  });
});

describe("SPEC-CORE-177 step 3 I5 kinds under an excluded kind", () => {
  it.each([
    ["-type:document", READING_BASE_KINDS, ["archive"], ["document"]],
    ["-type:pdf", READING_BASE_KINDS, ["archive", "epub"], ["pdf"]],
    ["-type:document", ["image", "video", "audio", "text", "other"], ["audio", "image", "other", "video"], ["document"]],
    ["type:video -type:image", ["image", "video"], ["video"], ["image"]],
    ["-type:audio", ["image"], ["image"], ["audio"]],
  ] as const)(
    "SPEC-CORE-177 %j over %j requests type %j and exclude_type %j",
    (query, base, types, excluded) => {
      const wire = wireOf(resolveAppTarget(folder(query), base));

      expect([...wire.getAll("type")].sort()).toEqual(types);
      expect(wire.getAll("exclude_type")).toEqual(excluded);
    },
  );

  it.each([
    ["-type:pdf -type:epub -type:archive", READING_BASE_KINDS],
    ["-type:document -type:archive", READING_BASE_KINDS],
    ["-type:image", ["image"]],
    ["type:image -type:image", ["image", "video"]],
  ] as const)("SPEC-CORE-177 %j over %j leaves no base kind and is empty", (query, base) => {
    expect(resolveAppTarget(folder(query), base)).toEqual(EMPTY);
  });

  it.each(["-type:video", "type:video -type:video"])(
    "SPEC-CORE-177 %j leaves Video no kind and is empty",
    (query) => {
      expect(resolveVideoTarget(folder(query))).toEqual(EMPTY);
    },
  );

  it("SPEC-CORE-177 -type:image keeps Video's kind and sends the exclusion", () => {
    const wire = wireOf(resolveVideoTarget(folder("-type:image")));

    expect(wire.getAll("type")).toEqual(["video"]);
    expect(wire.getAll("exclude_type")).toEqual(["image"]);
  });
});

describe("SPEC-CORE-177 step 4 I5 an impossible query is an empty target", () => {
  const IMPOSSIBLE = [
    "tag:a -tag:a",
    "is:favorite -is:favorite",
    "is:liked -is:liked",
    "has:tag -has:tag",
    "has:collection -has:collection",
    "path:A -path:A",
    "tag:a -has:tag",
  ];

  it.each(IMPOSSIBLE)("SPEC-CORE-177 Video %j is empty", (query) => {
    expect(resolveVideoTarget(folder(query))).toEqual(EMPTY);
  });

  for (const base of BASES) {
    it.each(IMPOSSIBLE)(`SPEC-CORE-177 %j is empty (${base.join(",")})`, (query) => {
      expect(resolveAppTarget(folder(query), base)).toEqual(EMPTY);
    });
  }
});

describe("SPEC-CORE-177 step 7 spellings the parser does not negate are text", () => {
  const TEXT: [string, string][] = [
    ["!type:pdf", "!type:pdf"],
    ["!is:liked", "!is:liked"],
    ["-size:>1MB", "-size:>1MB"],
    ["-duration:>1m", "-duration:>1m"],
    ["x -path : a", "x -path : a"],
  ];

  it.each(TEXT)("SPEC-CORE-177 resolveAppTarget puts %j in search", (query, search) => {
    expect(resolveAppTarget(folder(query), READING_BASE_KINDS)).toMatchObject({
      usable: true,
      params: { search },
    });
  });
});

describe("SPEC-CORE-177 step 6 I2 I7 which queries are member targets", () => {
  it.each(["-tag:x", "has:tag", "-has:collection", "-path:Work -in:Trip", "-is:favorite", "-type:image"])(
    "SPEC-CORE-177 I2 %j with no free text is not a member target",
    (query) => {
      expect(resolveVideoMemberTarget(folder(query))).toBeNull();
      expect(resolveReadingMemberTarget(folder(query))).toBeNull();
      expect(resolveMemberTarget(folder(query), ["image"])).toBeNull();
    },
  );

  it("SPEC-CORE-177 I7 a new token with duration: is a member target unless the caller takes duration", () => {
    const f = folder("-tag:x duration:>1h");

    expect(resolveMemberTarget(f, READING_BASE_KINDS)).not.toBeNull();
    expect(resolveMemberTarget(f, READING_BASE_KINDS, { directDuration: false })).not.toBeNull();
    expect(resolveMemberTarget(f, ["video"], { directDuration: true })).toBeNull();
    expect(resolveReadingMemberTarget(f)).not.toBeNull();
    expect(resolveVideoMemberTarget(f)).toBeNull();
  });
});

describe("SPEC-CORE-177 I4 a direct target sends what the member evaluation sends", () => {
  async function evaluationWire(query: string): Promise<URLSearchParams> {
    const sent: ListingFilters[] = [];
    const io: SmartCollectionEvalIo = {
      getDriveFiles: (async (_drive: string, params: ListingFilters) => {
        sent.push(params);
        return { data: [], meta: { total: 0, page: 1, limit: 500 } };
      }) as unknown as SmartCollectionEvalIo["getDriveFiles"],
      getSemanticAvailability: (async () => false) as unknown as SmartCollectionEvalIo["getSemanticAvailability"],
      fetchSemanticHits: (async () => []) as unknown as SmartCollectionEvalIo["fetchSemanticHits"],
    };
    await evaluateSmartCollection(
      { drive: "main", query, type: null, sort: "title" as never, order: "asc" as never, includeSceneClip: false },
      io,
    );
    expect(sent.length).toBeGreaterThan(0);
    const out = new URLSearchParams();
    appendListingFilters(out, sent[0]);
    return out;
  }

  function withoutType(wire: URLSearchParams): [string, string][] {
    return [...wire.entries()].filter(([key]) => key !== "type").sort();
  }

  const CORPUS = [
    "-path:Work",
    "tag:Trip -tag:draft",
    "-type:image",
    "-in:Old has:tag",
    "-is:favorite -is:liked",
    "-has:collection path:Videos",
    "size:>10MB -tag:x",
    ALL_KEYS,
  ];

  it.each([...CORPUS, "duration:>10m -tag:x"])("SPEC-CORE-177 Video %j", async (query) => {
    const direct = wireOf(resolveVideoTarget(folder(query)));

    expect(withoutType(direct)).toEqual(withoutType(await evaluationWire(query)));
  });

  it.each(CORPUS)("SPEC-CORE-177 Reading %j", async (query) => {
    const direct = wireOf(resolveReadingTarget(folder(query)));

    expect(withoutType(direct)).toEqual(withoutType(await evaluationWire(query)));
  });
});
