/**
 * Rescan says what happened.
 *
 * The button sits in an overflow menu that closes on click, so the
 * spinner driven by `scanning` rendered inside a menu nobody could
 * still see — pressing Rescan looked like pressing nothing. A 409 (a
 * scan already running) and a real failure were both swallowed by a
 * bare `catch`, so "working", "already working" and "broken" were three
 * identical silences.
 */

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

  it("reports the counts when the drive changed", async () => {
    vi.mocked(scanDrive).mockResolvedValue({
      added: 3, missing: 1, recovered: 2, updated: 0, total: 40,
    });
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    const message = toast.success.mock.calls[0][0] as string;
    expect(message).toContain("3");
    expect(message).toContain("2");
    expect(message).toContain("1");
  });

  it("says so plainly when nothing changed", async () => {
    const { result } = renderHook(() => useDriveScan("main", onComplete));
    await act(async () => {
      await result.current.handleScan();
    });
    // Not the counts message — three zeroes read as a puzzle.
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/nothing changed/i),
    );
  });

  it("tells a 409 apart from a failure", async () => {
    // The scanner takes one run per drive at a time. Being told so is
    // an answer; being told "failed" would be wrong.
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
