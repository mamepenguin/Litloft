import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { EPUB_SAVE_DELAY_MS, useEpubProgress } from "../epubProgress";
import { getWatchProgress, saveWatchProgress } from "../api";
import { getSavedPlayback, saveProgress } from "../recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

vi.mock("../api", () => ({
  getWatchProgress: vi.fn(),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../recentlyPlayed", () => ({
  getSavedPlayback: vi.fn().mockReturnValue({ position: 0, duration: 0 }),
  saveProgress: vi.fn(),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: vi.fn(),
}));

const mockGetWatchProgress = vi.mocked(getWatchProgress);
const mockSaveWatchProgress = vi.mocked(saveWatchProgress);
const mockGetSavedPlayback = vi.mocked(getSavedPlayback);
const mockSaveProgress = vi.mocked(saveProgress);
const mockUseProfile = vi.mocked(useProfile);

function profile(nickname: string | null) {
  mockUseProfile.mockReturnValue({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  profile("kaori");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("readSaved", () => {
  it.each([
    [{ position: 0.4, duration: 1 }, 0.4],
    [{ position: 0.999, duration: 1 }, 0.999],
    [{ position: 1, duration: 1 }, null],
    [{ position: 0, duration: 1 }, null],
    [{ position: 0, duration: 0 }, null],
    [{ position: 12, duration: 300 }, null],
    [{ position: 0.4, duration: 2 }, null],
  ])("a stored %o opens at %s", async (stored, expected) => {
    mockGetWatchProgress.mockResolvedValue(stored);
    const { result } = renderHook(() => useEpubProgress("f1"));
    await expect(result.current.readSaved()).resolves.toBe(expected);
  });

  it("a failed read opens at the start", async () => {
    mockGetWatchProgress.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useEpubProgress("f1"));
    await expect(result.current.readSaved()).resolves.toBeNull();
  });

  it("without a profile it reads the local record", async () => {
    profile(null);
    mockGetSavedPlayback.mockReturnValue({ position: 0.3, duration: 1 });
    const { result } = renderHook(() => useEpubProgress("f1"));
    await expect(result.current.readSaved()).resolves.toBe(0.3);
    expect(mockGetWatchProgress).not.toHaveBeenCalled();
  });
});

describe("turned", () => {
  it("writes the fraction once the reader stops turning", () => {
    const { result } = renderHook(() => useEpubProgress("f1"));
    act(() => {
      result.current.turned(0.2, false);
      result.current.turned(0.3, false);
    });
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS);
    });
    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 0.3, 1);
  });

  it("a turn onto the last page is stored as 1", () => {
    const { result } = renderHook(() => useEpubProgress("f1"));
    act(() => {
      result.current.turned(0.97, true);
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS);
    });
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 1, 1);
  });

  it("the first page is never written", () => {
    const { result } = renderHook(() => useEpubProgress("f1"));
    act(() => {
      result.current.turned(0, false);
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS);
    });
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("turning back to the first page cancels a pending write", () => {
    const { result } = renderHook(() => useEpubProgress("f1"));
    act(() => {
      result.current.turned(0.1, false);
      result.current.turned(0, false);
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS);
    });
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("a pending write is flushed when the book closes", () => {
    const { result, unmount } = renderHook(() => useEpubProgress("f1"));
    act(() => {
      result.current.turned(0.5, false);
    });
    unmount();
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 0.5, 1);
  });

  it("a pending write goes to the book it was made in when the file changes", () => {
    const { result, rerender } = renderHook(({ id }) => useEpubProgress(id), {
      initialProps: { id: "f1" },
    });
    act(() => {
      result.current.turned(0.5, false);
    });
    rerender({ id: "f2" });
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("f1", 0.5, 1);
  });

  it("without a profile it writes the local record", () => {
    profile(null);
    const { result } = renderHook(() => useEpubProgress("f1"));
    act(() => {
      result.current.turned(0.4, false);
      vi.advanceTimersByTime(EPUB_SAVE_DELAY_MS);
    });
    expect(mockSaveProgress).toHaveBeenCalledWith("f1", 0.4, 1);
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });
});
