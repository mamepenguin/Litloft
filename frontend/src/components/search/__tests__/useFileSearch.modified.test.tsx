/**
 * SPEC-CORE-138 sending 2: the modal sends the resolved `modified` wire forms
 * to the listing and to the meaning stage, and an impossible range requests
 * neither.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem, FileKind } from "@/types";

import { useFileSearch } from "../useFileSearch";

const ORIGINAL_TZ = vi.hoisted(() => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  return original;
});

const NOW_MS = Date.UTC(2026, 10, 18, 3, 0, 0);
const YEAR = 365 * 86_400;


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
  query: "modified:<2024 京都",
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


beforeAll(() => {
  if (new Date(2024, 0, 1).getTime() / 1000 !== 1704034800) {
    throw new Error("TZ=Asia/Tokyo did not take effect");
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_MS);
});

afterAll(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("SPEC-CORE-138 sending 2 useFileSearch sends the same wire forms to both stages", () => {
  it.each([
    ["modified:<2024 京都", ["lt:1704034800"]],
    ["modified:<=2023 modified:<2024 京都", ["lt:1704034800"]],
    ["modified:<1y 京都", [`lt:${NOW_MS / 1000 - YEAR}`]],
  ])("%s", async (query, wire) => {
    const view = await open({ query });

    await waitFor(() => expect(getDriveFiles).toHaveBeenCalled());
    await waitFor(() => expect(semantic.fetch).toHaveBeenCalled());

    expect(getDriveFiles.mock.calls[0][1]).toMatchObject({ search: "京都", modified: wire });
    expect(semantic.fetch.mock.calls[0][2].filter.modified).toEqual(wire);
    view.unmount();
  });
});

describe("SPEC-CORE-138 parsing 5 an impossible range requests nothing in the modal", () => {
  it.each([
    ["crossing years", "modified:>2024 modified:<2023 京都"],
    ["before 1970", "modified:<100y 京都"],
  ])("%s", async (_name, query) => {
    const view = await open({ query });

    await settle();

    expect(getDriveFiles).not.toHaveBeenCalled();
    expect(semantic.fetch).not.toHaveBeenCalled();
    view.unmount();
  });
});
