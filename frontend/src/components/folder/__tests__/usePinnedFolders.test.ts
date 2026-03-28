import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePinnedFolders } from "../usePinnedFolders";

const mockRequestRefresh = vi.fn();

vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: mockRequestRefresh }),
}));

vi.mock("@/lib/api", () => ({
  getPins: vi.fn().mockResolvedValue([]),
  addPin: vi.fn().mockResolvedValue({}),
  removePin: vi.fn().mockResolvedValue({}),
}));

import { getPins, addPin, removePin } from "@/lib/api";

describe("usePinnedFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with empty pinned paths", () => {
    const { result } = renderHook(() => usePinnedFolders("main"));
    expect(result.current.pinnedPaths.size).toBe(0);
  });

  it("loads pins on mount", async () => {
    vi.mocked(getPins).mockResolvedValueOnce([
      { path: "photos" },
      { path: "docs" },
    ]);
    const { result } = renderHook(() => usePinnedFolders("main"));

    await waitFor(() => {
      expect(result.current.pinnedPaths.size).toBe(2);
    });
    expect(result.current.pinnedPaths.has("photos")).toBe(true);
    expect(result.current.pinnedPaths.has("docs")).toBe(true);
  });

  it("adds a pin and refreshes sidebar", async () => {
    vi.mocked(getPins).mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePinnedFolders("main"));

    await waitFor(() => {
      expect(getPins).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.handleTogglePin("photos");
    });

    expect(addPin).toHaveBeenCalledWith("main", "photos");
    expect(result.current.pinnedPaths.has("photos")).toBe(true);
    expect(mockRequestRefresh).toHaveBeenCalled();
  });

  it("removes a pin and refreshes sidebar", async () => {
    vi.mocked(getPins).mockResolvedValueOnce([{ path: "photos" }]);
    const { result } = renderHook(() => usePinnedFolders("main"));

    await waitFor(() => {
      expect(result.current.pinnedPaths.has("photos")).toBe(true);
    });

    await act(async () => {
      await result.current.handleTogglePin("photos");
    });

    expect(removePin).toHaveBeenCalledWith("main", "photos");
    expect(result.current.pinnedPaths.has("photos")).toBe(false);
    expect(mockRequestRefresh).toHaveBeenCalled();
  });

  it("handles getPins error gracefully", async () => {
    vi.mocked(getPins).mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => usePinnedFolders("main"));

    await waitFor(() => {
      expect(getPins).toHaveBeenCalled();
    });
    expect(result.current.pinnedPaths.size).toBe(0);
  });
});
