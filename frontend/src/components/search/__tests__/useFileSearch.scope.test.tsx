/**
 * SPEC-CORE-043 I6: the modal's search sends `path:` / `in:` to the listing and
 * to the meaning stage, and its cached snapshot is what shows while refetching.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem, FileKind } from "@/types";

import { useFileSearch } from "../useFileSearch";

const mockFile = (id: string): FileItem => ({
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
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const getDriveFiles = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
}));

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/lib/searchCache", () => ({
  readSearchCache: (...args: unknown[]) => cache.read(...args),
  writeSearchCache: (...args: unknown[]) => cache.write(...args),
  searchCacheKey: (key: { drive: string; query: string; type: unknown; includeSceneClip: boolean }) =>
    `${key.drive}::${key.query}::${key.type ?? "all"}::${key.includeSceneClip ? 1 : 0}`,
  clearSearchCache: vi.fn(),
}));

const semantic = vi.hoisted(() => ({
  available: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/semanticSearch", () => ({
  isSemanticSearchAvailable: (...args: unknown[]) => semantic.available(...args),
  fetchSemanticHits: (...args: unknown[]) => semantic.fetch(...args),
}));

const base = {
  open: true,
  drive: "main",
  query: 'path:"My Photos" in:旅行 京都',
  scopeType: null as FileKind | null,
  browsing: false,
};

const listing = {
  data: [mockFile("f1")],
  meta: { total: 1, page: 1, limit: 8 },
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function open(input: Partial<typeof base> = {}) {
  return renderHook((props: typeof base) => useFileSearch(props), {
    initialProps: { ...base, ...input },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getDriveFiles.mockResolvedValue(listing);
  cache.read.mockReturnValue(null);
  semantic.available.mockResolvedValue(false);
  semantic.fetch.mockResolvedValue({ ok: true, results: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-043 I6 useFileSearch sends the new scope to both stages", () => {
  it("sends the same folders and collections to the listing and the filter", async () => {
    semantic.available.mockResolvedValue(true);
    const view = await open();

    await waitFor(() => expect(getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetch).toHaveBeenCalled());

    const params = getDriveFiles.mock.calls[0][1];
    expect(params).toMatchObject({
      search: "京都",
      folder: ["My Photos"],
      collection: ["旅行"],
    });
    expect(params).not.toHaveProperty("path");
    expect(params).not.toHaveProperty("recursive");

    const filter = semantic.fetch.mock.calls[0][2].filter;
    expect(filter).toMatchObject({
      folders: ["My Photos"],
      collections: ["旅行"],
    });
    view.unmount();
  });

  it("keeps a scoped modal's kind and the operators together", async () => {
    const view = await open({ query: "path:Work type:pdf 予算", scopeType: "document" });

    await waitFor(() => expect(getDriveFiles).toHaveBeenCalled());

    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "予算",
      folder: ["Work"],
      type: "pdf",
    });
    view.unmount();
  });
});

describe("SPEC-CORE-043 I6 useFileSearch loading and refetching", () => {
  it("is loading with no rows while the first listing is in flight, asking for the folder", async () => {
    const answer = deferred<typeof listing>();
    getDriveFiles.mockReturnValue(answer.promise);

    const view = await open({ query: "path:Work 京都" });

    await waitFor(() => expect(view.result.current.loading).toBe(true));
    expect(view.result.current.merged).toEqual([]);
    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "京都",
      folder: ["Work"],
    });

    answer.resolve(listing);
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.merged.map((file) => file.id)).toEqual(["f1"]);
    view.unmount();
  });

  it("shows the cached snapshot while it refetches the narrowed listing", async () => {
    cache.read.mockReturnValue({
      filenameMatches: [mockFile("cached")],
      filenameTotal: 1,
      semanticHits: [],
    });
    const answer = deferred<typeof listing>();
    getDriveFiles.mockReturnValue(answer.promise);

    const view = await open({ query: "path:Work 京都" });

    await waitFor(() => expect(view.result.current.loading).toBe(true));
    expect(view.result.current.merged.map((file) => file.id)).toEqual(["cached"]);
    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "京都",
      folder: ["Work"],
    });

    answer.resolve(listing);
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.merged.map((file) => file.id)).toEqual(["f1"]);
    view.unmount();
  });
});
