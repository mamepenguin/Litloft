/**
 * SPEC-CORE-044 I6/I7/I11: the results page sends the size and duration wire
 * forms to the listing and to the meaning stage, and an impossible range
 * requests neither.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { filterQueryParam } from "@/lib/searchQuery";
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

describe("SPEC-CORE-044 I6 useFolderFiles sends the same wire forms to both stages", () => {
  it("sends the size and duration comparisons to the listing and the filter", async () => {
    const { result } = renderSearch("size:>1GB duration:>=30m 京都");

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    const params = api.getDriveFiles.mock.calls[0][1];
    expect(params).toMatchObject({
      search: "京都",
      size: ["gt:1073741824"],
      duration: ["gte:1800"],
    });

    const filter = semantic.fetchHits.mock.calls[0][2].filter;
    expect(filter.sizes).toEqual(["gt:1073741824"]);
    expect(filter.durations).toEqual(["gte:1800"]);
  });

  it("sends several comparisons and collapses equal ones", async () => {
    renderSearch(
      "size:>100MB size:>104857600B duration:<5m duration:>=30m 予算",
    );

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    const params = api.getDriveFiles.mock.calls[0][1];
    expect(params).toMatchObject({
      size: ["gt:104857600"],
      duration: ["lt:300", "gte:1800"],
    });

    const filter = semantic.fetchHits.mock.calls[0][2].filter;
    expect(filterQueryParam(filter)).toBe(
      '{"sizes":["gt:104857600"],"durations":["lt:300","gte:1800"]}',
    );
  });

  it("keeps the operators beside the toolbar kind", async () => {
    renderHook(() =>
      useFolderFiles({
        driveName: "main",
        folderPath: "",
        view: null,
        tagFilter: null,
        typeFilter: "video",
        sort: "relevance",
        order: "desc",
        refreshKey: 0,
        searchQuery: "size:<500MB duration:>=30m 京都",
      }),
    );

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());

    expect(api.getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "京都",
      type: "video",
      size: ["lt:524288000"],
      duration: ["gte:1800"],
    });
  });
});

describe("SPEC-CORE-044 I7 an impossible range requests nothing", () => {
  const impossible = [
    ["sizes that cross", "size:>1GB size:<500MB 京都"],
    ["a size below zero", "size:<0 京都"],
    ["no whole byte between 1024 and 1025", "size:>1024 size:<1025 京都"],
    ["durations that cross", "duration:>10m duration:<=10m 京都"],
  ];

  it.each(impossible)("requests neither stage for %s", async (_name, query) => {
    const { result } = renderSearch(query);

    await settle();

    expect(api.getDriveFiles).not.toHaveBeenCalled();
    expect(semantic.fetchHits).not.toHaveBeenCalled();
    expect(result.current.files).toEqual([]);

    act(() => result.current.onShowMore());
    await settle();

    expect(api.getDriveFiles).not.toHaveBeenCalled();
    expect(semantic.fetchHits).not.toHaveBeenCalled();
  });
});

describe("SPEC-CORE-044 I11 a query without size or duration is unchanged", () => {
  it("sends no size or duration parameter and the same filter text", async () => {
    renderSearch("tag:会議 type:pdf 予算");

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    const params = api.getDriveFiles.mock.calls[0][1];
    expect(params).not.toHaveProperty("size");
    expect(params).not.toHaveProperty("duration");
    expect(params).toMatchObject({ search: "予算", tag: ["会議"], type: "pdf" });

    const filter = semantic.fetchHits.mock.calls[0][2].filter;
    expect(filterQueryParam(filter)).toBe('{"tags":["会議"],"kinds":["pdf"]}');
  });
});
