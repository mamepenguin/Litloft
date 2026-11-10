/**
 * SPEC-CORE-069 I10: `?view=continue` lists the desk, 50 at most, under the
 * view's type filter, newest played first, with no listing request.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { FileKind, WatchHistoryItem } from "@/types";

import { useFolderFiles } from "../useFolderFiles";

const item = (id: string): WatchHistoryItem => ({
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
  watch_progress: { position: 30, duration: 60 },
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

let nickname: string | null = "alice";
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/lib/recentlyPlayed", () => ({
  getRecentFileIds: () => [],
}));

function renderView(typeFilter: FileKind | null) {
  return renderHook(() =>
    useFolderFiles({
      driveName: "main",
      view: "continue",
      tagFilter: null,
      typeFilter,
      sort: "title",
      order: "asc",
      refreshKey: 0,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  nickname = "alice";
  api.getDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 30 } });
  api.getFolders.mockResolvedValue([]);
  api.getWatchHistory.mockResolvedValue([item("newest"), item("older")]);
});

describe("SPEC-CORE-069 I10 the continue view's request", () => {
  it.each([
    ["video" as FileKind, "video"],
    ["pdf" as FileKind, "pdf"],
  ])("SPEC-CORE-069 asks for filter=continue, 50, type %s", async (kind, sent) => {
    const { result } = renderView(kind);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getWatchHistory).toHaveBeenCalledTimes(1);
    const [drive, limit, filter, type] = api.getWatchHistory.mock.calls[0];
    expect([drive, limit, filter, type]).toEqual(["main", 50, "continue", sent]);
    expect(api.getDriveFiles).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-069 sends no type without a type filter and keeps the server's order", async () => {
    const { result } = renderView(null);

    await waitFor(() => expect(result.current.files.map((f) => f.id)).toEqual(["newest", "older"]));
    const [drive, limit, filter, type] = api.getWatchHistory.mock.calls[0];
    expect([drive, limit, filter]).toEqual(["main", 50, "continue"]);
    expect(type ?? null).toBeNull();
    expect(result.current.hasMore).toBe(false);
    expect(api.getDriveFiles).not.toHaveBeenCalled();
    expect(api.getFolders).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-069 lists nothing and falls back to no listing without a profile", async () => {
    nickname = null;
    const { result } = renderView(null);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.files).toEqual([]);
    expect(result.current.hasProfile).toBe(false);
    expect(api.getDriveFiles).not.toHaveBeenCalled();
  });
});
