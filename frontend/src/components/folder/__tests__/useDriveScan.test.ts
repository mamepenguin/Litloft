import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDriveScan } from "../useDriveScan";

vi.mock("@/lib/api", () => ({
  scanDrive: vi.fn().mockResolvedValue({}),
}));

import { scanDrive } from "@/lib/api";

describe("useDriveScan", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with scanning false", () => {
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    expect(result.current.scanning).toBe(false);
  });

  it("scans successfully and calls onComplete", async () => {
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    expect(scanDrive).toHaveBeenCalledWith("main");
    expect(onComplete).toHaveBeenCalled();
    expect(result.current.scanning).toBe(false);
  });

  it("handles scan error gracefully", async () => {
    vi.mocked(scanDrive).mockRejectedValueOnce(new Error("409"));
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    expect(result.current.scanning).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
