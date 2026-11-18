/**
 * SPEC-CORE-138: the results page resolves `modified:` once per search run in
 * the browser's zone, sends the wire forms to the listing and to the meaning
 * stage, and requests nothing for an impossible range.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { filterQueryParam } from "@/lib/searchQuery";
import type { FileItem } from "@/types";

import { useFolderFiles } from "../useFolderFiles";

const ORIGINAL_TZ = vi.hoisted(() => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  return original;
});

const NOW_MS = Date.UTC(2026, 10, 18, 3, 0, 0);
const NOW = NOW_MS / 1000;
const DAY = 86_400;
const tokyoMidnight = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000 - 9 * 3600;

const mockFile = (id: string): FileItem =>
  ({
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
    modified_at: null,
  }) as FileItem;

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

function pagedListing(total: number) {
  return async (_drive: string, params: { page?: number; limit?: number }) => {
    const page = params.page ?? 1;
    const limit = params.limit ?? 30;
    const count = Math.max(0, Math.min(limit, total - (page - 1) * limit));
    return {
      data: Array.from({ length: count }, (_, i) => mockFile(`p${page}-${i}`)),
      meta: { total, page, limit },
    };
  };
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

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
};

const listingModified = () =>
  api.getDriveFiles.mock.calls.map((call) => (call[1] as { modified?: string[] }).modified);

const filterModified = () =>
  semantic.fetchHits.mock.calls.map((call) => (call[2] as { filter?: { modified?: string[] } }).filter?.modified);

beforeAll(() => {
  if (new Date(2024, 0, 1).getTime() / 1000 !== 1704034800) {
    throw new Error("TZ=Asia/Tokyo did not take effect");
  }
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterAll(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW_MS);
  api.getDriveFiles.mockImplementation(pagedListing(1));
  api.getFolders.mockResolvedValue([]);
  api.getWatchHistory.mockResolvedValue([]);
  semantic.isAvailable.mockResolvedValue(true);
  semantic.fetchHits.mockResolvedValue({ ok: true, results: [] });
  semantic.fetchImages.mockResolvedValue({ ok: true, results: [] });
});

afterEach(() => {
  vi.setSystemTime(NOW_MS);
});

describe("SPEC-CORE-138 I6 parsing 2 absolute amounts resolve to the period's boundary", () => {
  it.each([
    ["<2024", ["lt:1704034800"]],
    ["<=2023", ["lt:1704034800"]],
    ["<2024-01-01", ["lt:1704034800"]],
    [">2023-12-31", ["gte:1704034800"]],
    ["<=2023-12-31", ["lt:1704034800"]],
    [">=2024-06", [`gte:${tokyoMidnight(2024, 6, 1)}`]],
    ["<=2024-06", [`lt:${tokyoMidnight(2024, 7, 1)}`]],
    [">2024-06", [`gte:${tokyoMidnight(2024, 7, 1)}`]],
    ["<2024/6/5", [`lt:${tokyoMidnight(2024, 6, 5)}`]],
    [">=2024-6-5", [`gte:${tokyoMidnight(2024, 6, 5)}`]],
    ["<=2024/06/05", [`lt:${tokyoMidnight(2024, 6, 6)}`]],
    [">2024-02-29", [`gte:${tokyoMidnight(2024, 3, 1)}`]],
    ["<=2024-12", [`lt:${tokyoMidnight(2025, 1, 1)}`]],
    [">=1970", ["gte:0"]],
  ])("modified:%s sends %j", async (amount, wire) => {
    renderSearch(`modified:${amount} 京都`);

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    expect(listingModified()[0]).toEqual(wire);
    expect(filterModified()[0]).toEqual(wire);
  });

  it("sends the shared wire form of two identities once", async () => {
    renderSearch("modified:<2024 modified:<=2023 modified:<2024-01-01 京都");

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());

    expect(listingModified()[0]).toEqual(["lt:1704034800"]);
  });
});

describe("SPEC-CORE-138 I7 parsing 3 relative amounts resolve against now with fixed lengths", () => {
  it.each([
    ["<1y", `lt:${NOW - 365 * DAY}`],
    [">=30d", `gte:${NOW - 30 * DAY}`],
    [">=30D", `gte:${NOW - 30 * DAY}`],
    ["<2w", `lt:${NOW - 14 * DAY}`],
    ["<6m", `lt:${NOW - 180 * DAY}`],
    [">1d", `gt:${NOW - DAY}`],
    ["<=3y", `lte:${NOW - 3 * 365 * DAY}`],
  ])("modified:%s sends %s", async (amount, wire) => {
    renderSearch(`modified:${amount} 京都`);

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    expect(listingModified()[0]).toEqual([wire]);
    expect(filterModified()[0]).toEqual([wire]);
  });

  it("puts the year boundary between 364 and 366 days ago", async () => {
    renderSearch("modified:<1y");

    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());

    const [wire] = listingModified()[0] ?? [];
    const boundary = Number(String(wire).replace("lt:", ""));
    expect(NOW - 366 * DAY < boundary).toBe(true);
    expect(NOW - 364 * DAY >= boundary).toBe(true);
  });
});

describe("SPEC-CORE-138 sending 1 the filter writes modified last", () => {
  it("writes modified after every other key", async () => {
    renderSearch("tag:会議 size:>1GB modified:<2024 京都");

    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    const filter = semantic.fetchHits.mock.calls[0][2].filter;
    expect(filterQueryParam(filter)).toBe(
      '{"tags":["会議"],"sizes":["gt:1073741824"],"modified":["lt:1704034800"]}',
    );
  });
});

describe("SPEC-CORE-138 parsing 5 an impossible range requests nothing", () => {
  it.each([
    ["crossing years", "modified:>2024 modified:<2023 京都"],
    ["a relative amount before 1970", "modified:<100y 京都"],
    ["a day and the day before", "modified:>=2024-06-05 modified:<2024-06-05 京都"],
  ])("%s", async (_name, query) => {
    const { result } = renderSearch(query);

    await settle();

    expect(api.getDriveFiles).not.toHaveBeenCalled();
    expect(semantic.fetchHits).not.toHaveBeenCalled();
    expect(result.current.files).toEqual([]);
  });
});

describe("SPEC-CORE-138 I10 a query with no modified: token is unchanged", () => {
  it("sends no modified parameter and no modified key, where a modified: query does", async () => {
    renderSearch("modified:<2024 予算");
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());
    expect(api.getDriveFiles.mock.calls[0][1]).toHaveProperty("modified");
    vi.clearAllMocks();

    renderSearch("tag:会議 type:pdf 予算");
    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetchHits).toHaveBeenCalled());

    const params = api.getDriveFiles.mock.calls[0][1];
    expect(params).not.toHaveProperty("modified");
    expect(params).toMatchObject({ search: "予算", tag: ["会議"], type: "pdf" });
    const filter = semantic.fetchHits.mock.calls[0][2].filter;
    expect(filterQueryParam(filter)).toBe('{"tags":["会議"],"kinds":["pdf"]}');
  });
});

describe("SPEC-CORE-138 I11 I18 one now per search run", () => {
  it("resolves again when a new run starts a day later", async () => {
    const view = renderSearch("modified:<1y 京都");
    await waitFor(() => expect(api.getDriveFiles).toHaveBeenCalled());
    expect(listingModified()[0]).toEqual([`lt:${NOW - 365 * DAY}`]);

    vi.setSystemTime(NOW_MS + DAY * 1000);
    view.rerender({ q: "modified:<1y 大阪" });

    await waitFor(() =>
      expect(listingModified().at(-1)).toEqual([`lt:${NOW + DAY - 365 * DAY}`]),
    );
  });
});
