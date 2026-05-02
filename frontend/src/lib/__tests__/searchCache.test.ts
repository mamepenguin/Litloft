import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { FileItem } from "@/types";
import {
  clearSearchCache,
  readSearchCache,
  searchCacheKey,
  writeSearchCache,
  type SearchCacheKey,
} from "../searchCache";
import type { SemanticHit } from "../searchMerge";

function makeFile(overrides: Partial<FileItem>): FileItem {
  return {
    id: "f1",
    filename: "f1.mp4",
    title: "f1",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 100,
    duration: 60,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHit(overrides: Partial<SemanticHit> = {}): SemanticHit {
  return {
    file_id: "f1",
    drive: "main",
    filename: "f1.mp4",
    file_type: "video",
    score: 0.8,
    match_types: ["transcript"],
    segments: [],
    file: null,
    ...overrides,
  };
}

const baseKey: SearchCacheKey = {
  drive: "main",
  query: "video",
  type: null,
  includeSceneClip: false,
};

describe("searchCacheKey", () => {
  it("produces the same string for the same input", () => {
    const a = searchCacheKey({ ...baseKey });
    const b = searchCacheKey({ ...baseKey });
    expect(a).toBe(b);
  });

  it("produces a different string when drive differs", () => {
    expect(searchCacheKey({ ...baseKey })).not.toBe(
      searchCacheKey({ ...baseKey, drive: "other" }),
    );
  });

  it("produces a different string when query differs", () => {
    expect(searchCacheKey({ ...baseKey })).not.toBe(
      searchCacheKey({ ...baseKey, query: "audio" }),
    );
  });

  it("produces a different string when type differs", () => {
    expect(searchCacheKey({ ...baseKey })).not.toBe(
      searchCacheKey({ ...baseKey, type: "video" }),
    );
  });

  it("produces a different string when includeSceneClip differs", () => {
    expect(searchCacheKey({ ...baseKey })).not.toBe(
      searchCacheKey({ ...baseKey, includeSceneClip: true }),
    );
  });
});

describe("readSearchCache / writeSearchCache", () => {
  beforeEach(() => {
    clearSearchCache();
  });

  it("returns null for never-written key", () => {
    expect(readSearchCache(baseKey)).toBeNull();
  });

  it("read after write returns the same data", () => {
    const filenameMatches = [makeFile({ id: "f1" })];
    const semanticHits = [makeHit({ file_id: "f2" })];
    writeSearchCache(baseKey, {
      filenameMatches,
      filenameTotal: 1,
      semanticHits,
    });
    const got = readSearchCache(baseKey);
    expect(got).not.toBeNull();
    expect(got!.filenameMatches).toEqual(filenameMatches);
    expect(got!.filenameTotal).toBe(1);
    expect(got!.semanticHits).toEqual(semanticHits);
    expect(typeof got!.ts).toBe("number");
  });

  it("partial write merges into one entry (filename then semantic)", () => {
    const filenameMatches = [makeFile({ id: "f1" })];
    writeSearchCache(baseKey, { filenameMatches, filenameTotal: 1 });

    const semanticHits = [makeHit({ file_id: "f2" })];
    writeSearchCache(baseKey, { semanticHits });

    const got = readSearchCache(baseKey);
    expect(got).not.toBeNull();
    expect(got!.filenameMatches).toEqual(filenameMatches);
    expect(got!.filenameTotal).toBe(1);
    expect(got!.semanticHits).toEqual(semanticHits);
  });

  it("partial write merges in the reverse order (semantic then filename)", () => {
    const semanticHits = [makeHit({ file_id: "f2" })];
    writeSearchCache(baseKey, { semanticHits });

    const filenameMatches = [makeFile({ id: "f1" })];
    writeSearchCache(baseKey, { filenameMatches, filenameTotal: 3 });

    const got = readSearchCache(baseKey);
    expect(got).not.toBeNull();
    expect(got!.filenameMatches).toEqual(filenameMatches);
    expect(got!.filenameTotal).toBe(3);
    expect(got!.semanticHits).toEqual(semanticHits);
  });

  it("treats different keys as independent entries", () => {
    writeSearchCache(baseKey, {
      filenameMatches: [makeFile({ id: "a" })],
      filenameTotal: 1,
    });
    const otherKey: SearchCacheKey = { ...baseKey, query: "other" };
    writeSearchCache(otherKey, {
      filenameMatches: [makeFile({ id: "b" })],
      filenameTotal: 99,
    });

    const a = readSearchCache(baseKey);
    const b = readSearchCache(otherKey);
    expect(a?.filenameMatches[0].id).toBe("a");
    expect(a?.filenameTotal).toBe(1);
    expect(b?.filenameMatches[0].id).toBe("b");
    expect(b?.filenameTotal).toBe(99);
  });

  it("differentiates entries by includeSceneClip flag", () => {
    writeSearchCache(baseKey, {
      filenameMatches: [makeFile({ id: "off" })],
      filenameTotal: 1,
    });
    writeSearchCache(
      { ...baseKey, includeSceneClip: true },
      { filenameMatches: [makeFile({ id: "on" })], filenameTotal: 2 },
    );

    expect(readSearchCache(baseKey)?.filenameMatches[0].id).toBe("off");
    expect(
      readSearchCache({ ...baseKey, includeSceneClip: true })
        ?.filenameMatches[0].id,
    ).toBe("on");
  });

  it("clearSearchCache empties everything", () => {
    writeSearchCache(baseKey, {
      filenameMatches: [makeFile({})],
      filenameTotal: 1,
      semanticHits: [makeHit()],
    });
    expect(readSearchCache(baseKey)).not.toBeNull();
    clearSearchCache();
    expect(readSearchCache(baseKey)).toBeNull();
  });
});

describe("readSearchCache TTL", () => {
  beforeEach(() => {
    clearSearchCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the entry within the 60s TTL window", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    writeSearchCache(baseKey, {
      filenameMatches: [makeFile({})],
      filenameTotal: 1,
    });
    vi.advanceTimersByTime(59_000);
    expect(readSearchCache(baseKey)).not.toBeNull();
  });

  it("returns null after the 60s TTL has elapsed", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    writeSearchCache(baseKey, {
      filenameMatches: [makeFile({})],
      filenameTotal: 1,
    });
    vi.advanceTimersByTime(60_001);
    expect(readSearchCache(baseKey)).toBeNull();
  });
});
