/**
 * SPEC-CORE-047 I6/I7/I11: the modal sends the size and duration wire forms to
 * the listing and to the meaning stage, and an impossible range requests
 * neither.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { filterQueryParam } from "@/lib/searchQuery";
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
  query: "size:>1GB duration:>=30m 京都",
  scopeType: null as FileKind | null,
  browsing: false,
};

const listing = {
  data: [mockFile("f1")],
  meta: { total: 1, page: 1, limit: 8 },
};

async function open(input: Partial<typeof base> = {}) {
  return renderHook((props: typeof base) => useFileSearch(props), {
    initialProps: { ...base, ...input },
  });
}

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  getDriveFiles.mockResolvedValue(listing);
  cache.read.mockReturnValue(null);
  semantic.available.mockResolvedValue(true);
  semantic.fetch.mockResolvedValue({ ok: true, results: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-047 I6 useFileSearch sends the same wire forms to both stages", () => {
  it("sends the size and duration comparisons to the listing and the filter", async () => {
    const view = await open();

    await waitFor(() => expect(getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetch).toHaveBeenCalled());

    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "京都",
      size: ["gt:1073741824"],
      duration: ["gte:1800"],
    });

    const filter = semantic.fetch.mock.calls[0][2].filter;
    expect(filter.sizes).toEqual(["gt:1073741824"]);
    expect(filter.durations).toEqual(["gte:1800"]);
    view.unmount();
  });

  it("keeps a scoped modal's kind and the new operators together", async () => {
    const view = await open({
      query: "size:<500MB duration:<5m 予算",
      scopeType: "video",
    });

    await waitFor(() => expect(getDriveFiles).toHaveBeenCalled());

    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({
      search: "予算",
      type: "video",
      size: ["lt:524288000"],
      duration: ["lt:300"],
    });
    view.unmount();
  });
});

describe("SPEC-CORE-047 I7 an impossible range requests nothing", () => {
  const impossible = [
    ["sizes that cross", "size:>1GB size:<500MB 京都"],
    ["a size below zero", "size:<0 京都"],
    ["no whole byte between 1024 and 1025", "size:>1024 size:<1025 京都"],
    ["durations that cross", "duration:>10m duration:<=10m 京都"],
  ];

  it.each(impossible)("requests neither stage for %s", async (_name, query) => {
    const view = await open({ query });

    await settle();

    expect(getDriveFiles).not.toHaveBeenCalled();
    expect(semantic.fetch).not.toHaveBeenCalled();
    expect(view.result.current.merged).toEqual([]);
    view.unmount();
  });
});

describe("SPEC-CORE-047 I11 a query without size or duration is unchanged", () => {
  it("sends no size or duration parameter and the same filter text", async () => {
    const view = await open({ query: "tag:会議 type:pdf 予算" });

    await waitFor(() => expect(getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetch).toHaveBeenCalled());

    const params = getDriveFiles.mock.calls[0][1];
    expect(params).not.toHaveProperty("size");
    expect(params).not.toHaveProperty("duration");
    expect(params).toMatchObject({ search: "予算", tag: ["会議"], type: "pdf" });

    const filter = semantic.fetch.mock.calls[0][2].filter;
    expect(filterQueryParam(filter)).toBe('{"tags":["会議"],"kinds":["pdf"]}');
    view.unmount();
  });
});
