import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/components/ToastProvider", () => ({ useToast: () => toast }));

vi.mock("@/lib/api", async () => {
  class ApiStatusError extends Error {
    constructor(readonly status: number, message: string) {
      super(message);
      this.name = "ApiStatusError";
    }
  }
  return {
    ApiStatusError,
    scanDrive: vi.fn(),
  };
});

import { useDriveScan } from "../useDriveScan";
import { ApiStatusError, scanDrive } from "@/lib/api";

const NOTHING = { added: 0, missing: 0, recovered: 0, updated: 0, total: 12 };

describe("useDriveScan", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scanDrive).mockResolvedValue(NOTHING);
  });

  it("initializes with scanning false", () => {
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    expect(result.current.scanning).toBe(false);
  });

  it("says it started before anything is known", async () => {
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("main"));
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

  it("puts each count against its own word", async () => {
    vi.mocked(scanDrive).mockResolvedValue({
      added: 11, missing: 33, recovered: 22, updated: 0, total: 40,
    });
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    const message = toast.success.mock.calls[0][0] as string;
    expect(message).toMatch(/11 added/);
    expect(message).toMatch(/22 recovered/);
    expect(message).toMatch(/33 missing/);
  });

  it("says so plainly when nothing changed", async () => {
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/nothing changed/i),
    );
  });

  it("tells a 409 apart from a failure", async () => {
    vi.mocked(scanDrive).mockRejectedValueOnce(
      new ApiStatusError(409, "API error: 409 Conflict"),
    );
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringMatching(/already being rescanned/i),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("reports a real failure as one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(scanDrive).mockRejectedValueOnce(
      new ApiStatusError(500, "API error: 500"),
    );
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed/i));
    expect(result.current.scanning).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
