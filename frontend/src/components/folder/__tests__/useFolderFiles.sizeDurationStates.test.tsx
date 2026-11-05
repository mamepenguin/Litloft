import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getDriveFiles.mockResolvedValue(page);
  api.getFolders.mockResolvedValue([]);
  api.getWatchHistory.mockResolvedValue([]);
  semantic.isAvailable.mockResolvedValue(true);
  semantic.fetchHits.mockResolvedValue({ ok: true, results: [] });
  semantic.fetchImages.mockResolvedValue({ ok: true, results: [] });
});

describe("SPEC-CORE-044 I7 an impossible range settles with nothing to show", () => {
  it("stops loading with no files and asks for neither stage", async () => {
    const { result } = renderSearch("size:>1GB size:<500MB 京都");

    await settle();

    expect(result.current.loading).toBe(false);
    expect(result.current.files).toEqual([]);
    expect(api.getDriveFiles).not.toHaveBeenCalled();
    expect(semantic.fetchHits).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-044 I6 a changed range refetches with the new comparison", () => {
  it("goes back to loading and sends the new wire form", async () => {
    const { result, rerender } = renderSearch("size:>1GB 京都");
    await waitFor(() => expect(result.current.loading).toBe(false));

    let answer: (value: typeof page) => void = () => {};
    api.getDriveFiles.mockReturnValue(
      new Promise<typeof page>((resolve) => {
        answer = resolve;
      }),
    );
    rerender({ q: "size:>2GB 京都" });

    await waitFor(() => expect(result.current.loading).toBe(true));
    await waitFor(() =>
      expect(api.getDriveFiles.mock.calls.at(-1)?.[1]).toMatchObject({
        search: "京都",
        size: ["gt:2147483648"],
      }),
    );

    answer(page);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
