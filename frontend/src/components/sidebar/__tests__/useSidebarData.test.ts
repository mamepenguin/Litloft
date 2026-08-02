import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSidebarData } from "../useSidebarData";

vi.mock("@/lib/api", () => ({
  getDrives: vi.fn().mockResolvedValue([]),
  getDriveTags: vi.fn().mockResolvedValue([]),
  getPins: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
  getAuthStatus: vi.fn().mockResolvedValue({ unlocked_groups: [], has_protected_drives: false }),
  getDriveSummary: vi.fn().mockResolvedValue({ name: "", trash_count: 0, missing_count: 0 }),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn().mockReturnValue(null),
}));

import { getDrives, getDriveTags, getPins, getCollections, getAuthStatus } from "@/lib/api";

describe("useSidebarData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches drives and auth status on mount", async () => {
    vi.mocked(getDrives).mockResolvedValueOnce([
      { name: "main", protected: false, file_count: 0 },
    ]);
    const { result } = renderHook(() => useSidebarData(null, null, 0));

    await waitFor(() => {
      expect(result.current.drives).toHaveLength(1);
    });
    expect(result.current.drives[0].name).toBe("main");
    expect(getAuthStatus).toHaveBeenCalled();
  });

  it("fetches tags, pins, collections when currentDrive is set", async () => {
    vi.mocked(getDriveTags).mockResolvedValueOnce([{ name: "nature", count: 5 }]);
    vi.mocked(getPins).mockResolvedValueOnce([{ path: "photos" }]);
    vi.mocked(getCollections).mockResolvedValueOnce([
      { id: "c1", name: "My Collection", description: null, drive: "main", item_count: 3, first_file_id: null, created_at: "", updated_at: "" },
    ]);

    const { result } = renderHook(() => useSidebarData("main", null, 0));

    await waitFor(() => {
      expect(result.current.tags).toHaveLength(1);
    });
    expect(result.current.pins).toHaveLength(1);
    expect(result.current.collectionList).toHaveLength(1);
  });

  it("clears drive-specific data when currentDrive is null", async () => {
    const { result } = renderHook(() => useSidebarData(null, null, 0));

    await waitFor(() => {
      expect(getDrives).toHaveBeenCalled();
    });

    expect(result.current.tags).toHaveLength(0);
    expect(result.current.pins).toHaveLength(0);
    expect(result.current.collectionList).toHaveLength(0);
    expect(getDriveTags).not.toHaveBeenCalled();
  });

  it("refetches when refreshKey changes", async () => {
    const { rerender } = renderHook(
      ({ drive, key }) => useSidebarData(drive, null, key),
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
    const { result } = renderHook(() => useSidebarData(null, null, 0));

    await waitFor(() => {
      expect(getDrives).toHaveBeenCalled();
    });
    expect(result.current.drives).toHaveLength(0);
  });

  it("handles getDriveTags error gracefully", async () => {
    vi.mocked(getDriveTags).mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useSidebarData("main", null, 0));

    await waitFor(() => {
      expect(getDriveTags).toHaveBeenCalled();
    });
    expect(result.current.tags).toHaveLength(0);
  });

  it("refetches tags with folder_path when currentFolderPath changes, without refetching pins/collections", async () => {
    vi.mocked(getDriveTags).mockResolvedValue([]);
    const { rerender } = renderHook(
      ({ folderPath }) => useSidebarData("main", folderPath, 0),
      { initialProps: { folderPath: null as string | null } },
    );

    await waitFor(() => {
      expect(getDriveTags).toHaveBeenCalledWith("main", null);
    });
    expect(getPins).toHaveBeenCalledTimes(1);

    rerender({ folderPath: "recipes" });

    await waitFor(() => {
      expect(getDriveTags).toHaveBeenCalledWith("main", "recipes");
    });
    expect(getDriveTags).toHaveBeenCalledTimes(2);
    // Pins/collections/driveSummary are drive-scoped, not folder-scoped,
    // so a folder-only change must not trigger their effect again.
    expect(getPins).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale request (opened with folderPath=null, then published) clobber a newer folder-scoped result", async () => {
    let resolveStaleRequest: (tags: { name: string; count: number }[]) => void = () => {};
    const staleRequest = new Promise<{ name: string; count: number }[]>((resolve) => {
      resolveStaleRequest = resolve;
    });

    vi.mocked(getDriveTags).mockImplementation((_drive, folderPath) =>
      folderPath === null ? staleRequest : Promise.resolve([{ name: "scoped", count: 1 }]),
    );

    // Mirrors opening a folder URL directly: currentFolderPath starts null
    // (before the folder page has published its path) and is then updated.
    const { rerender, result } = renderHook(
      ({ folderPath }) => useSidebarData("main", folderPath, 0),
      { initialProps: { folderPath: null as string | null } },
    );
    rerender({ folderPath: "recipes" });

    await waitFor(() => {
      expect(result.current.tags).toEqual([{ name: "scoped", count: 1 }]);
    });

    // The null-folderPath request finally resolves late; it must be ignored.
    // Await the promise itself (not an arbitrary timeout) and wrap in act()
    // so React has actually flushed the resulting state update, if any,
    // before we assert — otherwise the assertion could pass by mere luck
    // of running before the clobbering re-render commits.
    await act(async () => {
      resolveStaleRequest([{ name: "stale-drive-wide", count: 99 }]);
      await staleRequest;
    });

    expect(result.current.tags).toEqual([{ name: "scoped", count: 1 }]);
  });
});
