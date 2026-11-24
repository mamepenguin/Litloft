/** SPEC-CORE-125 I8: a rejected drive summary, whatever its status, leaves the sidebar as before. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiStatusError } from "@/lib/apiError";
import { useSidebarData } from "../useSidebarData";

vi.mock("@/lib/api", () => ({
  getDrives: vi.fn().mockResolvedValue([]),
  getDriveTags: vi.fn().mockResolvedValue([]),
  getPins: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
  getAuthStatus: vi.fn().mockResolvedValue({ unlocked_groups: [], has_protected_drives: false, is_admin: false }),
  getDriveSummary: vi.fn(),
}));

let scanEvent: unknown = null;
vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => scanEvent,
}));

import { getDriveSummary } from "@/lib/api";

const GOOD = { name: "main", trash_count: 3, missing_count: 2 };

beforeEach(() => {
  scanEvent = null;
  vi.mocked(getDriveSummary).mockReset();
});

describe("SPEC-CORE-125 I8 useSidebarData with a rejected summary", () => {
  it("is null after a mount", async () => {
    vi.mocked(getDriveSummary).mockRejectedValue(new ApiStatusError(404, "API error: 404 Not Found"));
    const { result } = renderHook(() => useSidebarData("main", null, 0));
    await waitFor(() => expect(getDriveSummary).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.driveSummary).toBeNull();
  });

  it("keeps its previous value after a refresh from a scan event", async () => {
    vi.mocked(getDriveSummary).mockResolvedValueOnce(GOOD);
    const { result, rerender } = renderHook(() => useSidebarData("main", null, 0));
    await waitFor(() => expect(result.current.driveSummary).toEqual(GOOD));

    vi.mocked(getDriveSummary).mockRejectedValue(new ApiStatusError(404, "API error: 404 Not Found"));
    scanEvent = { type: "scan:complete" };
    rerender();
    await waitFor(() => expect(getDriveSummary).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.driveSummary).toEqual(GOOD);
  });
});
