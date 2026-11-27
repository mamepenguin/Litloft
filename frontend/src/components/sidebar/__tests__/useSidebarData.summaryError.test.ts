/** SPEC-CORE-125 I8: a rejected drive summary, whatever its status, leaves the sidebar as before. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebSocketContext, type WebSocketContextValue } from "@/components/WebSocketProvider";
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

import { getDriveSummary } from "@/lib/api";

const GOOD = { name: "main", trash_count: 3, missing_count: 2 };

let wsValue: WebSocketContextValue = { lastEvent: null, connected: true };

function wrapper({ children }: { children: ReactNode }) {
  return createElement(WebSocketContext.Provider, { value: wsValue }, children);
}

beforeEach(() => {
  wsValue = { lastEvent: null, connected: true };
  vi.mocked(getDriveSummary).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
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

  it("keeps its previous value after a refresh from a drive.structure_changed round", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(getDriveSummary).mockResolvedValueOnce(GOOD);
    const { result, rerender } = renderHook(() => useSidebarData("main", null, 0), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.driveSummary).toEqual(GOOD);

    vi.mocked(getDriveSummary).mockRejectedValue(new ApiStatusError(404, "API error: 404 Not Found"));
    wsValue = { lastEvent: { event: "drive.structure_changed", data: { drive: "main" } }, connected: true };
    await act(async () => {
      rerender();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(getDriveSummary).toHaveBeenCalledTimes(2);
    expect(result.current.driveSummary).toEqual(GOOD);
  });
});
