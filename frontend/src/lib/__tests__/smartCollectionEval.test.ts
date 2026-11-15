/**
 * SPEC-CORE-109 step 1, I1, I4: a Smart Collection's members are what its
 * search page lists in the Files view once every page has loaded.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem } from "@/types";
import type { SemanticHit } from "@/lib/searchMerge";

import { useFolderFiles } from "@/components/folder/useFolderFiles";
import { evaluateSmartCollection } from "../smartCollectionEval";

type EvalInput = Parameters<typeof evaluateSmartCollection>[0];
type EvalIo = Parameters<typeof evaluateSmartCollection>[1];

const file = (id: string, createdAt: string, overrides: Partial<FileItem> = {}): FileItem => ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: createdAt,
  updated_at: createdAt,
  ...overrides,
});

const hit = (fileId: string, score: number, hydrated: FileItem | null): SemanticHit =>
  ({
    file_id: fileId,
    drive: "main",
    filename: `${fileId}.mp4`,
    file_type: "video",
    score,
    match_types: ["transcript"],
    segments: [
      {
        time_range: [10, 20] as [number, number],
        matches: [{ type: "transcript", score }],
      },
    ],
    file: hydrated,
  }) as SemanticHit;

/** Distinct, descending `created_at` so `created_at desc` is the array order. */
function rows(n: number, prefix = "f"): FileItem[] {
  const base = Date.UTC(2026, 0, 1);
  return Array.from({ length: n }, (_, i) =>
    file(`${prefix}${i}`, new Date(base - i * 60_000).toISOString()),
  );
}

type ListingParams = { page?: number; limit?: number } & Record<string, unknown>;

function listing(all: FileItem[]) {
  return vi.fn(async (_drive: string, params: ListingParams) => {
    const page = params.page ?? 1;
    const limit = params.limit ?? 30;
    return {
      data: all.slice((page - 1) * limit, page * limit),
      meta: { total: all.length, page, limit },
    };
  });
}

const hookApi = vi.hoisted(() => ({
  getDriveFiles: vi.fn(),
  getFolders: vi.fn(),
  batchGetFiles: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => hookApi.getDriveFiles(...args),
  getFolders: (...args: unknown[]) => hookApi.getFolders(...args),
  batchGetFiles: (...args: unknown[]) => hookApi.batchGetFiles(...args),
}));

vi.mock("@/lib/recentlyPlayed", () => ({
  getRecentFileIds: () => [],
}));

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: () => null,
  writeSearchCache: vi.fn(),
  searchCacheKey: () => "key",
  clearSearchCache: vi.fn(),
}));

const hookSemantic = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  fetchHits: vi.fn(),
  fetchImages: vi.fn(),
}));

vi.mock("@/lib/semanticSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/semanticSearch")>();
  return {
    ...actual,
    isSemanticSearchAvailable: (...args: unknown[]) => hookSemantic.isAvailable(...args),
    fetchSemanticHits: (...args: unknown[]) => hookSemantic.fetchHits(...args),
    fetchSemanticImages: (...args: unknown[]) => hookSemantic.fetchImages(...args),
  };
});

function io(overrides: Partial<Record<keyof EvalIo, unknown>> = {}): EvalIo {
  return {
    getDriveFiles: listing([]),
    getSemanticAvailability: vi.fn(async () => "available"),
    fetchSemanticHits: vi.fn(async () => ({ ok: true, results: [] })),
    ...overrides,
  } as unknown as EvalIo;
}

function input(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    drive: "main",
    query: "kyoto",
    type: null,
    sort: "relevance",
    order: "desc",
    includeSceneClip: false,
    ...overrides,
  } as EvalInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  hookApi.getFolders.mockResolvedValue([]);
  hookApi.batchGetFiles.mockResolvedValue([]);
  hookSemantic.fetchImages.mockResolvedValue({ ok: true, results: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ids = (files: readonly FileItem[]) => files.map((f) => f.id);

describe("SPEC-CORE-109 I1 evaluateSmartCollection equals the search page's Files view", () => {
  const listed = rows(12);
  const semanticOnly = file("sem-hydrated", "2025-06-01T00:00:00Z");
  const hits = [
    hit(listed[5].id, 0.95, listed[5]),
    hit("sem-hydrated", 0.9, semanticOnly),
    hit("sem-bare", 0.85, null),
    hit(listed[0].id, 0.4, listed[0]),
  ];

  async function pageFiles(args: {
    query: string;
    type: EvalInput["type"];
    sort: string;
    order: "asc" | "desc";
    includeSceneClip: boolean;
  }) {
    const { result } = renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: args.type ?? null,
        sort: args.sort,
        order: args.order,
        refreshKey: 0,
        searchQuery: args.query,
        includeSceneClip: args.includeSceneClip,
      } as Parameters<typeof useFolderFiles>[0]),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    if (args.query.includes("kyoto")) {
      await waitFor(() => {
        const shown = ids(result.current.files);
        for (const h of hits) expect(shown).toContain(h.file_id);
      });
    }
    return result.current.files;
  }

  it.each([
    ["free text by relevance", "kyoto", null, "relevance", "desc", false],
    ["free text by newest", "kyoto", null, "created_at", "desc", false],
    ["free text by title", "kyoto", null, "title", "asc", false],
    ["free text with scene search", "kyoto", null, "relevance", "desc", true],
    ["free text with the URL type", "kyoto", "video", "relevance", "desc", false],
    ["free text with operators", "kyoto tag:trip", null, "relevance", "desc", false],
    ["operators only", "tag:trip is:favorite", null, "relevance", "desc", false],
  ] as const)(
    "%s: same files in the same order, and the same requests",
    async (_label, query, type, sort, order, includeSceneClip) => {
      const fake = listing(listed);
      hookApi.getDriveFiles.mockImplementation(fake);
      hookSemantic.isAvailable.mockResolvedValue(true);
      hookSemantic.fetchHits.mockResolvedValue({ ok: true, results: hits });

      const shown = await pageFiles({ query, type, sort, order, includeSceneClip });

      const evalListing = listing(listed);
      const evalHits = vi.fn(async () => ({ ok: true, results: hits }));
      const result = await evaluateSmartCollection(
        input({ query, type, sort, order, includeSceneClip } as Partial<EvalInput>),
        io({ getDriveFiles: evalListing, fetchSemanticHits: evalHits }),
      );

      expect(result.complete).toBe(true);
      expect(ids(result.files)).toEqual(ids(shown));

      const strip = (p: ListingParams) => {
        const { page: _p, limit: _l, ...rest } = p;
        return rest;
      };
      expect(strip(evalListing.mock.calls[0][1])).toEqual(strip(fake.mock.calls[0][1] as ListingParams));

      expect(evalHits.mock.calls.length).toBe(hookSemantic.fetchHits.mock.calls.length);
      if (evalHits.mock.calls.length > 0) {
        const pageCall = hookSemantic.fetchHits.mock.calls[0];
        const evalCall = evalHits.mock.calls[0] as unknown[];
        expect(evalCall[0]).toEqual(pageCall[0]);
        expect(evalCall[1]).toEqual(pageCall[1]);
        expect(evalCall[2]).toMatchObject({ limit: 1000, passages: true });
        const { signal: _ps, ...pageOpts } = (pageCall[2] ?? {}) as Record<string, unknown>;
        const { signal: _es, ...evalOpts } = (evalCall[2] ?? {}) as Record<string, unknown>;
        expect(evalOpts).toEqual(pageOpts);
      }
    },
  );

  it("equals a fixed fixture's expected list (listing only, newest first)", async () => {
    const all = [
      file("b", "2026-03-03T00:00:00Z"),
      file("a", "2026-03-02T00:00:00Z"),
      file("c", "2026-03-01T00:00:00Z"),
    ];
    const getDriveFiles = listing(all);

    const result = await evaluateSmartCollection(
      input({ query: "tag:trip", sort: "created_at", order: "desc" } as Partial<EvalInput>),
      io({ getDriveFiles }),
    );

    expect(result).toEqual({ files: all, complete: true });
  });

  it("keeps unhydrated meaning-search hits as members", async () => {
    const result = await evaluateSmartCollection(
      input({ query: "kyoto" }),
      io({
        getDriveFiles: listing([]),
        fetchSemanticHits: vi.fn(async () => ({ ok: true, results: [hit("sem-bare", 0.9, null)] })),
      }),
    );

    expect(result.complete).toBe(true);
    expect(ids(result.files)).toEqual(["sem-bare"]);
  });
});

describe("SPEC-CORE-109 step 1 every listing page is read at 500 a page", () => {
  it.each([
    [0, 1],
    [1, 1],
    [499, 1],
    [500, 2],
    [501, 2],
    [1001, 3],
  ])("%i rows: %i listing requests, all of them returned", async (n, requests) => {
    const all = rows(n);
    const getDriveFiles = listing(all);
    const fetchSemanticHits = vi.fn(async () => ({ ok: true, results: [] }));

    const result = await evaluateSmartCollection(
      input({ query: "kyoto" }),
      io({ getDriveFiles, fetchSemanticHits }),
    );

    expect(getDriveFiles).toHaveBeenCalledTimes(requests);
    getDriveFiles.mock.calls.forEach(([drive, params], i) => {
      expect(drive).toBe("main");
      expect(params).toMatchObject({ page: i + 1, limit: 500 });
    });
    expect(result.complete).toBe(true);
    expect(ids(result.files).sort()).toEqual(ids(all).sort());
    expect(fetchSemanticHits).toHaveBeenCalledTimes(1);
  });

  it("sends relevance to the listing as created_at desc", async () => {
    const getDriveFiles = listing(rows(2));

    await evaluateSmartCollection(input({ query: "kyoto", sort: "relevance", order: "asc" } as Partial<EvalInput>), io({ getDriveFiles }));

    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({ sort: "created_at", order: "desc" });
  });
});

describe("SPEC-CORE-109 step 1 random sort", () => {
  it("reads the listing newest first and returns a permutation of the members", async () => {
    const all = rows(20);
    const getDriveFiles = listing(all);
    const hits = [hit("sem-bare", 0.9, null)];

    const result = await evaluateSmartCollection(
      input({ query: "kyoto", sort: "random", order: "desc" } as Partial<EvalInput>),
      io({ getDriveFiles, fetchSemanticHits: vi.fn(async () => ({ ok: true, results: hits })) }),
    );

    for (const [, params] of getDriveFiles.mock.calls) {
      expect(params).toMatchObject({ sort: "created_at", order: "desc" });
    }
    expect(result.complete).toBe(true);
    expect([...ids(result.files)].sort()).toEqual([...ids(all), "sem-bare"].sort());
  });
});

describe("SPEC-CORE-109 step 1 / I1 meaning search runs only when the page would run it", () => {
  it("asks no availability and no meaning search for an operator-only query", async () => {
    const getSemanticAvailability = vi.fn(async () => "available");
    const fetchSemanticHits = vi.fn(async () => ({ ok: true, results: [] }));

    const result = await evaluateSmartCollection(
      input({ query: "tag:trip" }),
      io({ getDriveFiles: listing(rows(3)), getSemanticAvailability, fetchSemanticHits }),
    );

    expect(fetchSemanticHits).not.toHaveBeenCalled();
    expect(result.complete).toBe(true);
    expect(ids(result.files)).toEqual(ids(rows(3)));
  });

  it("asks the availability for the request's drive", async () => {
    const getSemanticAvailability = vi.fn(async () => "available");

    await evaluateSmartCollection(
      input({ drive: "photos", query: "kyoto" }),
      io({ getSemanticAvailability }),
    );

    expect(getSemanticAvailability).toHaveBeenCalledWith("photos");
  });

  it("sends the free text alone with scene search when there are no operators", async () => {
    const fetchSemanticHits = vi.fn(async () => ({ ok: true, results: [] }));

    await evaluateSmartCollection(
      input({ query: "kyoto", includeSceneClip: true }),
      io({ fetchSemanticHits }),
    );

    expect(fetchSemanticHits).toHaveBeenCalledTimes(1);
    const [query, drive, options] = fetchSemanticHits.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(query).toBe("kyoto");
    expect(drive).toBe("main");
    expect(options).toMatchObject({ limit: 1000, passages: true, includeSceneClip: true });
    expect(options.filter).toBeUndefined();
  });

  it("sends the query's filter when it has operators", async () => {
    const fetchSemanticHits = vi.fn(async () => ({ ok: true, results: [] }));

    await evaluateSmartCollection(input({ query: "kyoto tag:trip" }), io({ fetchSemanticHits }));

    const options = (fetchSemanticHits.mock.calls[0] as unknown as [string, string, Record<string, unknown>])[2];
    expect(options).toMatchObject({ limit: 1000, passages: true });
    expect(options.filter).toMatchObject({ tags: ["trip"] });
  });
});

describe("SPEC-CORE-109 I1 / I4 availability and meaning-search outcomes", () => {
  it("the addon off for the drive gives a complete listing-only result", async () => {
    const fetchSemanticHits = vi.fn(async () => ({ ok: true, results: [] }));

    const result = await evaluateSmartCollection(
      input({ query: "kyoto" }),
      io({
        getDriveFiles: listing(rows(3)),
        getSemanticAvailability: vi.fn(async () => "off"),
        fetchSemanticHits,
      }),
    );

    expect(fetchSemanticHits).not.toHaveBeenCalled();
    expect(result).toEqual({ files: rows(3), complete: true });
  });

  it("an unknown availability gives complete: false", async () => {
    const result = await evaluateSmartCollection(
      input({ query: "kyoto" }),
      io({
        getDriveFiles: listing(rows(3)),
        getSemanticAvailability: vi.fn(async () => "unknown"),
      }),
    );

    expect(result.complete).toBe(false);
  });

  function stubSearchStatus(status: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(status === 200 ? { results: [] } : { detail: "x" }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  }

  async function realFetchSemanticHits(...args: unknown[]) {
    const actual = await vi.importActual<typeof import("@/lib/semanticSearch")>("@/lib/semanticSearch");
    return (actual.fetchSemanticHits as (...a: unknown[]) => unknown)(...args);
  }

  it("meaning search answering 404 counts as off: a complete listing-only result", async () => {
    stubSearchStatus(404);

    const result = await evaluateSmartCollection(
      input({ query: "kyoto" }),
      io({ getDriveFiles: listing(rows(3)), fetchSemanticHits: realFetchSemanticHits }),
    );

    expect(result).toEqual({ files: rows(3), complete: true });
  });

  it.each([500, 503, 502])("meaning search answering %i gives complete: false", async (status) => {
    stubSearchStatus(status);

    const result = await evaluateSmartCollection(
      input({ query: "kyoto" }),
      io({ getDriveFiles: listing(rows(3)), fetchSemanticHits: realFetchSemanticHits }),
    );

    expect(result.complete).toBe(false);
  });

  it("a listing failure throws", async () => {
    const getDriveFiles = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(
      evaluateSmartCollection(input({ query: "tag:trip" }), io({ getDriveFiles })),
    ).rejects.toThrow();
  });

  it("a listing failure on a later page throws", async () => {
    const good = listing(rows(600));
    const getDriveFiles = vi.fn(async (drive: string, params: ListingParams) => {
      if ((params.page ?? 1) > 1) throw new Error("boom");
      return good(drive, params);
    });

    await expect(
      evaluateSmartCollection(input({ query: "tag:trip" }), io({ getDriveFiles })),
    ).rejects.toThrow();
  });
});

describe("SPEC-CORE-109 I1 an impossible query sends no request", () => {
  it.each([
    ["kinds that cannot both hold", "type:image kyoto", "video"],
    ["an impossible size range", "size:>2GB size:<1GB kyoto", null],
  ] as const)("%s", async (_label, query, type) => {
    const getDriveFiles = listing(rows(3));
    const getSemanticAvailability = vi.fn(async () => "available");
    const fetchSemanticHits = vi.fn(async () => ({ ok: true, results: [] }));

    const result = await evaluateSmartCollection(
      input({ query, type } as Partial<EvalInput>),
      io({ getDriveFiles, getSemanticAvailability, fetchSemanticHits }),
    );

    expect(result).toEqual({ files: [], complete: true });
    expect(getDriveFiles).not.toHaveBeenCalled();
    expect(getSemanticAvailability).not.toHaveBeenCalled();
    expect(fetchSemanticHits).not.toHaveBeenCalled();
  });
});
