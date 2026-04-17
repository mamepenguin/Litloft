import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSidebarData } from "../useSidebarData";

vi.mock("@/lib/api", () => ({
  getDrives: vi.fn().mockResolvedValue([]),
  getDriveTags: vi.fn().mockResolvedValue([]),
  getPins: vi.fn().mockResolvedValue([]),
  getPlaylists: vi.fn().mockResolvedValue([]),
  getAuthStatus: vi.fn().mockResolvedValue({ unlocked_groups: [], has_protected_drives: false }),
  getDriveSummary: vi.fn().mockResolvedValue({ name: "", trash_count: 0, missing_count: 0 }),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn().mockReturnValue(null),
}));

import { getDrives, getDriveTags, getPins, getPlaylists, getAuthStatus } from "@/lib/api";

describe("useSidebarData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches drives and auth status on mount", async () => {
    vi.mocked(getDrives).mockResolvedValueOnce([
      { name: "main", protected: false },
    ]);
    const { result } = renderHook(() => useSidebarData(null, 0));

    await waitFor(() => {
      expect(result.current.drives).toHaveLength(1);
    });
    expect(result.current.drives[0].name).toBe("main");
    expect(getAuthStatus).toHaveBeenCalled();
  });

  it("fetches tags, pins, playlists when currentDrive is set", async () => {
    vi.mocked(getDriveTags).mockResolvedValueOnce([{ name: "nature", count: 5 }]);
    vi.mocked(getPins).mockResolvedValueOnce([{ path: "photos" }]);
    vi.mocked(getPlaylists).mockResolvedValueOnce([
      { id: "pl1", name: "My Playlist", drive: "main", item_count: 3, first_file_id: null, created_at: "", updated_at: "" },
    ]);

    const { result } = renderHook(() => useSidebarData("main", 0));

    await waitFor(() => {
      expect(result.current.tags).toHaveLength(1);
    });
    expect(result.current.pins).toHaveLength(1);
    expect(result.current.playlistList).toHaveLength(1);
  });

  it("clears drive-specific data when currentDrive is null", async () => {
    const { result } = renderHook(() => useSidebarData(null, 0));

    await waitFor(() => {
      expect(getDrives).toHaveBeenCalled();
    });

    expect(result.current.tags).toHaveLength(0);
    expect(result.current.pins).toHaveLength(0);
    expect(result.current.playlistList).toHaveLength(0);
    expect(getDriveTags).not.toHaveBeenCalled();
  });

  it("refetches when refreshKey changes", async () => {
    const { rerender } = renderHook(
      ({ drive, key }) => useSidebarData(drive, key),
      { initialProps: { drive: "main" as string | null, key: 0 } }
    );

    await waitFor(() => {
      expect(getDrives).toHaveBeenCalledTimes(1);
    });

    rerender({ drive: "main", key: 1 });

    await waitFor(() => {
      expect(getDrives).toHaveBeenCalledTimes(2);
    });
  });

  it("handles getDrives error gracefully", async () => {
    vi.mocked(getDrives).mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useSidebarData(null, 0));

    await waitFor(() => {
      expect(getDrives).toHaveBeenCalled();
    });
    expect(result.current.drives).toHaveLength(0);
  });

  it("handles getDriveTags error gracefully", async () => {
    vi.mocked(getDriveTags).mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useSidebarData("main", 0));

    await waitFor(() => {
      expect(getDriveTags).toHaveBeenCalled();
    });
    expect(result.current.tags).toHaveLength(0);
  });
});
