/**
 * SPEC-CORE-043 I6: a query with `path:` or `in:` sends the same folders and
 * collections to the listing and to the meaning stage.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { FileItem } from "@/types";

import { useFolderFiles } from "../useFolderFiles";

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

const api = vi.hoisted(() => ({
  getDriveFiles: vi.fn(),
  getFolders: vi.fn(),
  getWatchHistory: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => api.getDriveFiles(...args),
  getFolders: (...args: unknown[]) => api.getFolders(...args),
  getWatchHistory: (...args: unknown[]) => api.getWatchHistory(...args),
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

const semantic = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  fetchHits: vi.fn(),
  fetchImages: vi.fn(),
}));

vi.mock("@/lib/semanticSearch", () => ({
  isSemanticSearchAvailable: (...args: unknown[]) => semantic.isAvailable(...args),
  fetchSemanticHits: (...args: unknown[]) => semantic.fetchHits(...args),
  fetchSemanticImages: (...args: unknown[]) => semantic.fetchImages(...args),
}));

const page = { data: [mockFile("f1")], meta: { total: 1, page: 1, limit: 30 } };

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderSearch(searchQuery: string) {
  return renderHook(
    ({ q }: { q: string }) =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: null,
        sort: "relevance",
        order: "desc",
        refreshKey: 0,
        searchQuery: q,
      }),
    { initialProps: { q: searchQuery } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getDriveFiles.mockResolvedValue(page);
  api.getFolders.mockResolvedValue([]);
  api.getWatchHistory.mockResolvedValue([]);
  semantic.isAvailable.mockResolvedValue(false);
  semantic.fetchHits.mockResolvedValue({ ok: true, results: [] });
  semantic.fetchImages.mockResolvedValue({ ok: true, results: [] });
});

describe("SPEC-CORE-043 I6 useFolderFiles sends the new scope to both stages", () => {
  it("sends the same folders and collections to the listing and the filter", async () => {
    semantic.isAvailable.mockResolvedValue(true);
    const { result } = renderSearch('path:"My Photos" in:旅行 京都');

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    const params = api.getDriveFiles.mock.calls[0][1];
    expect(params).toMatchObject({
      search: "京都",
      folder: ["My Photos"],
      collection: ["旅行"],
    });
    expect(params).not.toHaveProperty("path");
    expect(params).not.toHaveProperty("recursive");

    const filter = semantic.fetchHits.mock.calls[0][2].filter;
    expect(filter).toMatchObject({
      folders: ["My Photos"],
      collections: ["旅行"],
    });
  });

  it("sends several folders and collections as lists", async () => {
    renderSearch("path:Work path:Trips in:資料 in:Trip 予算");

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());

    expect(api.getDriveFiles.mock.calls[0][1]).toMatchObject({
      folder: ["Work", "Trips"],
      collection: ["資料", "Trip"],
    });
  });

  it("keeps the toolbar kind and the operators together", async () => {
    renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: "document",
        sort: "relevance",
        order: "desc",
        refreshKey: 0,
        searchQuery: "path:Work type:pdf 予算",
      }),
    );

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());

    expect(api.getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "予算",
      folder: ["Work"],
      type: "pdf",
    });
  });
});

describe("SPEC-CORE-043 I6 useFolderFiles loading and refetching", () => {
  it("is loading while the first listing is in flight, already asking for the folder", async () => {
    const answer = deferred<typeof page>();
    api.getDriveFiles.mockReturnValue(answer.promise);

    const { result } = renderSearch('path:"My Photos" 京都');

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.files).toEqual([]);
    expect(api.getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "京都",
      folder: ["My Photos"],
    });

    answer.resolve(page);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.files.map((file) => file.id)).toEqual(["f1"]);
  });

  it("goes back to loading and asks with the new folder on a query change", async () => {
    const { result, rerender } = renderSearch("path:Photos 京都");
    await waitFor(() => expect(result.current.loading).toBe(false));

    const next = deferred<typeof page>();
    api.getDriveFiles.mockReturnValue(next.promise);
    rerender({ q: "path:Work 京都" });

    await waitFor(() => expect(result.current.loading).toBe(true));
    await waitFor(() =>
      expect(api.getDriveFiles.mock.calls.at(-1)?.[1]).toMatchObject({
        search: "京都",
        folder: ["Work"],
      }),
    );

    next.resolve(page);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
