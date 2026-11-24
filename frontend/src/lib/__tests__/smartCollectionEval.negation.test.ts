/**
 * SPEC-CORE-172 sending 8: a Smart Collection evaluated on its own sends the
 * new conditions on its listing requests and in its meaning filter, sends a
 * `-in:` name as an excluded collection without classifying it, and requests
 * nothing for an impossible combination.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { getDriveFiles } from "../api";
import { filterQueryParam, type SearchFilter } from "../searchQuery";
import { evaluateSmartCollection } from "../smartCollectionEval";
import { installWireFetch, json, pagedListing, paramsOf, type WireCall } from "@/__tests__/helpers/wireFetch";

type EvalInput = Parameters<typeof evaluateSmartCollection>[0];
type EvalIo = Parameters<typeof evaluateSmartCollection>[1];

function input(query: string): EvalInput {
  return {
    drive: "main",
    query,
    type: null,
    sort: "created_at",
    order: "desc",
    includeSceneClip: false,
  } as EvalInput;
}

let wire: { calls: WireCall[] };

function setup() {
  wire = installWireFetch((call) => {
    if (call.url.pathname === "/api/drives/main/files") return pagedListing([], call);
    return json([]);
  });
  const fetchSemanticHits = vi.fn(async () => ({ ok: true, results: [] }));
  const getSemanticAvailability = vi.fn(async () => "available");
  const io = { getDriveFiles, getSemanticAvailability, fetchSemanticHits } as unknown as EvalIo;
  return { io, fetchSemanticHits, getSemanticAvailability };
}

const listings = () => wire.calls.filter((c) => c.url.pathname === "/api/drives/main/files");
const collectionLists = () =>
  wire.calls.filter((c) => /\/(collections|smart-folders)$/.test(c.url.pathname));

function sentFilter(fetchSemanticHits: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const options = fetchSemanticHits.mock.calls[0][2] as { filter: SearchFilter };
  return JSON.parse(filterQueryParam(options.filter)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-172 sending 8 the evaluation carries the new conditions", () => {
  it("on every listing request and inside the meaning filter", async () => {
    const { io, fetchSemanticHits } = setup();

    await evaluateSmartCollection(
      input("kyoto -tag:2023 -type:pdf -path:Work -is:favorite has:tag -has:collection"),
      io,
    );

    expect(listings().length).toBeGreaterThan(0);
    for (const call of listings()) {
      expect(paramsOf(call, "search")).toEqual(["kyoto"]);
      expect(paramsOf(call, "exclude_tag")).toEqual(["2023"]);
      expect(paramsOf(call, "exclude_type")).toEqual(["pdf"]);
      expect(paramsOf(call, "exclude_folder")).toEqual(["Work"]);
      expect(paramsOf(call, "favorite")).toEqual(["false"]);
      expect(paramsOf(call, "has_tag")).toEqual(["true"]);
      expect(paramsOf(call, "has_collection")).toEqual(["false"]);
    }
    expect(sentFilter(fetchSemanticHits)).toEqual({
      exclude_tags: ["2023"],
      exclude_kinds: ["pdf"],
      exclude_folders: ["Work"],
      favorite: false,
      has_tag: true,
      has_collection: false,
    });
  });

  it("sends a -in: name as an excluded collection without loading a list", async () => {
    const { io } = setup();

    await evaluateSmartCollection(input('-in:"Weekly" -in:Trip'), io);

    expect(listings().length).toBeGreaterThan(0);
    expect(paramsOf(listings()[0], "exclude_collection")).toEqual(["Weekly", "Trip"]);
    expect(paramsOf(listings()[0], "search")).toEqual([]);
    expect(collectionLists()).toEqual([]);
  });

  it.each([
    ["a tag in both polarities", "kyoto tag:x -tag:X"],
    ["untagged with has:tag", "has:tag -has:tag"],
    ["favorite in both polarities", "is:favorite -is:favorite"],
    ["in a collection and in none", "has:collection -has:collection"],
    ["a kind held by an excluded kind", "type:pdf -type:document"],
    ["a folder inside an excluded folder", "path:A/b -path:A"],
    ["a collection in both polarities", "in:Trip -in:trip"],
  ])("%s sends no request and lists nothing", async (_name, query) => {
    const { io, fetchSemanticHits, getSemanticAvailability } = setup();

    const result = await evaluateSmartCollection(input(query), io);

    expect(result).toEqual({ files: [], complete: true });
    expect(wire.calls).toEqual([]);
    expect(getSemanticAvailability).not.toHaveBeenCalled();
    expect(fetchSemanticHits).not.toHaveBeenCalled();
  });

  it.each([
    ["in:x -has:collection", "in:Trip -has:collection", "has_collection", "false"],
    ["type:document -type:pdf", "type:document -type:pdf", "exclude_type", "pdf"],
    ["path:A -path:A/b", "path:A -path:A/b", "exclude_folder", "A/b"],
  ])("%s is requested", async (_name, query, key, value) => {
    const { io } = setup();

    await evaluateSmartCollection(input(query), io);

    expect(listings().length).toBeGreaterThan(0);
    expect(paramsOf(listings()[0], key)).toEqual([value]);
  });
});
