import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePdfPageProgress, PDF_PAGE_SAVE_DELAY_MS } from "../pdfPageProgress";
import { getWatchProgress, saveWatchProgress } from "../api";
import { getSavedProgress, saveProgress } from "../recentlyPlayed";
import { useProfile } from "@/components/ProfileProvider";

vi.mock("../api", () => ({
  getWatchProgress: vi.fn(),
  saveWatchProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../recentlyPlayed", () => ({
  getSavedProgress: vi.fn().mockReturnValue(0),
  saveProgress: vi.fn(),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: vi.fn(),
}));

const mockGetWatchProgress = vi.mocked(getWatchProgress);
const mockSaveWatchProgress = vi.mocked(saveWatchProgress);
const mockGetSavedProgress = vi.mocked(getSavedProgress);
const mockSaveProgress = vi.mocked(saveProgress);
const mockUseProfile = vi.mocked(useProfile);

function withProfile() {
  mockUseProfile.mockReturnValue({
    nickname: "kaori",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

function withoutProfile() {
  mockUseProfile.mockReturnValue({
    nickname: null,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  });
}

function stored(position: number, duration = 20) {
  mockGetWatchProgress.mockResolvedValue({ position, duration });
}

function deferredStored() {
  let resolve!: (value: { position: number; duration: number }) => void;
  let reject!: (error: unknown) => void;
  mockGetWatchProgress.mockReturnValue(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return { resolve, reject };
}

interface Props {
  fileId: string;
  page: number;
  requestedPage?: number;
}

function setup(initial: Props) {
  const goTo = vi.fn();
  const hook = renderHook(
    (props: Props) => usePdfPageProgress({ ...props, goTo }),
    { initialProps: initial },
  );
  return { ...hook, goTo };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function waitSaveDelay() {
  act(() => {
    vi.advanceTimersByTime(PDF_PAGE_SAVE_DELAY_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGetSavedProgress.mockReturnValue(0);
  withProfile();
  stored(0, 0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePdfPageProgress restore", () => {
  it("goes to the stored page once the document has loaded", async () => {
    stored(7);
    const { result, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });
    expect(mockGetWatchProgress).not.toHaveBeenCalled();

    act(() => result.current.documentLoaded(20));
    await flushPromises();

    expect(mockGetWatchProgress).toHaveBeenCalledWith("file-aaaaaaa");
    expect(goTo).toHaveBeenCalledWith(7);
  });

  it.each([
    ["page 1", 1],
    ["no record", 0],
    ["the last page", 20],
    ["past the end", 25],
    ["a fraction", 3.5],
  ])("stays on the opened page for %s", async (_label, position) => {
    stored(position);
    const { result, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });

    act(() => result.current.documentLoaded(20));
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("does not read the stored page when a page was requested", async () => {
    stored(7);
    const { result, goTo } = setup({
      fileId: "file-aaaaaaa",
      page: 3,
      requestedPage: 3,
    });

    act(() => result.current.documentLoaded(20));
    await flushPromises();

    expect(mockGetWatchProgress).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
  });

  it("drops the stored page when a page is requested while it is read", async () => {
    const read = deferredStored();
    const { result, rerender, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });

    act(() => result.current.documentLoaded(20));
    rerender({ fileId: "file-aaaaaaa", page: 1, requestedPage: 1 });
    read.resolve({ position: 7, duration: 20 });
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("drops the stored page when the reader turned the page while it is read", async () => {
    const read = deferredStored();
    const { result, rerender, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });

    act(() => result.current.documentLoaded(20));
    rerender({ fileId: "file-aaaaaaa", page: 2 });
    read.resolve({ position: 7, duration: 20 });
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("drops a stored page that arrives after the file changed", async () => {
    const read = deferredStored();
    const { result, rerender, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });

    act(() => result.current.documentLoaded(20));
    rerender({ fileId: "file-bbbbbbb", page: 1 });
    read.resolve({ position: 7, duration: 20 });
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("restores only once per file", async () => {
    stored(7);
    const { result, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });

    act(() => result.current.documentLoaded(20));
    await flushPromises();
    act(() => result.current.documentLoaded(20));
    await flushPromises();

    expect(mockGetWatchProgress).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  it("restores again for the next file", async () => {
    stored(7);
    const { result, rerender, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));
    await flushPromises();

    stored(4, 10);
    rerender({ fileId: "file-bbbbbbb", page: 1 });
    act(() => result.current.documentLoaded(10));
    await flushPromises();

    expect(goTo).toHaveBeenLastCalledWith(4);
  });

  it("restores again on coming back to a file whose neighbour never loaded", async () => {
    stored(7);
    const { result, rerender, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));
    await flushPromises();

    rerender({ fileId: "file-bbbbbbb", page: 1 });
    rerender({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));
    await flushPromises();

    expect(goTo).toHaveBeenCalledTimes(2);
    expect(goTo).toHaveBeenLastCalledWith(7);
  });

  it("reads this device's record without a profile", async () => {
    withoutProfile();
    mockGetSavedProgress.mockReturnValue(6);
    const { result, goTo } = setup({ fileId: "file-aaaaaaa", page: 1 });

    act(() => result.current.documentLoaded(20));
    await flushPromises();

    expect(mockGetWatchProgress).not.toHaveBeenCalled();
    expect(mockGetSavedProgress).toHaveBeenCalledWith("file-aaaaaaa");
    expect(goTo).toHaveBeenCalledWith(6);
  });
});

describe("usePdfPageProgress save", () => {
  async function loaded(fileId = "file-aaaaaaa", n = 20) {
    const hook = setup({ fileId, page: 1 });
    act(() => hook.result.current.documentLoaded(n));
    await flushPromises();
    return hook;
  }

  it("saves the page and the page count after the delay", async () => {
    const { rerender } = await loaded();

    rerender({ fileId: "file-aaaaaaa", page: 5 });
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 5, 20);
  });

  it("writes one save for a run of page turns", async () => {
    const { rerender } = await loaded();

    rerender({ fileId: "file-aaaaaaa", page: 2 });
    rerender({ fileId: "file-aaaaaaa", page: 3 });
    rerender({ fileId: "file-aaaaaaa", page: 4 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 4, 20);
  });

  it("never writes page 1", async () => {
    const { rerender } = await loaded();

    rerender({ fileId: "file-aaaaaaa", page: 5 });
    waitSaveDelay();
    rerender({ fileId: "file-aaaaaaa", page: 1 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 5, 20);
  });

  it("does not write back the page it restored", async () => {
    stored(7);
    const { rerender } = await loaded();

    rerender({ fileId: "file-aaaaaaa", page: 7 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("writes nothing before the document has loaded", () => {
    const { rerender } = setup({ fileId: "file-aaaaaaa", page: 1 });

    rerender({ fileId: "file-aaaaaaa", page: 5 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("writes nothing while the stored page is being read", async () => {
    const read = deferredStored();
    const { result, rerender } = setup({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));

    rerender({ fileId: "file-aaaaaaa", page: 3 });
    waitSaveDelay();
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();

    read.resolve({ position: 0, duration: 0 });
    await flushPromises();
    rerender({ fileId: "file-aaaaaaa", page: 4 });
    waitSaveDelay();
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 4, 20);
  });

  it("saves again after a failed read", async () => {
    const read = deferredStored();
    const { result, rerender } = setup({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));
    read.reject(new Error("offline"));
    await flushPromises();

    rerender({ fileId: "file-aaaaaaa", page: 4 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 4, 20);
  });

  it("flushes a pending save to the previous file when the file changes", async () => {
    const { rerender } = await loaded();

    rerender({ fileId: "file-aaaaaaa", page: 6 });
    rerender({ fileId: "file-bbbbbbb", page: 6 });

    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 6, 20);
    waitSaveDelay();
    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
  });

  it("does not write the previous file's page under the next file", async () => {
    const { rerender, result } = await loaded();
    rerender({ fileId: "file-aaaaaaa", page: 6 });
    waitSaveDelay();
    mockSaveWatchProgress.mockClear();

    rerender({ fileId: "file-bbbbbbb", page: 6 });
    waitSaveDelay();
    rerender({ fileId: "file-bbbbbbb", page: 1 });
    act(() => result.current.documentLoaded(3));
    await flushPromises();
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("saves a page turned while the stored page was being read", async () => {
    const read = deferredStored();
    const { result, rerender } = setup({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));

    rerender({ fileId: "file-aaaaaaa", page: 2 });
    read.resolve({ position: 0, duration: 0 });
    await flushPromises();
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 2, 20);
  });

  it("writes nothing for a requested page, even one past the end", async () => {
    const { result, rerender } = setup({
      fileId: "file-aaaaaaa",
      page: 20,
      requestedPage: 20,
    });
    act(() => result.current.documentLoaded(8));
    rerender({ fileId: "file-aaaaaaa", page: 8, requestedPage: 20 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();

    rerender({ fileId: "file-aaaaaaa", page: 7, requestedPage: 20 });
    waitSaveDelay();
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 7, 8);
  });

  it("does not let the previous file's read hold back the next file's saves", async () => {
    const readA = deferredStored();
    const { result, rerender } = setup({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));

    rerender({ fileId: "file-bbbbbbb", page: 3, requestedPage: 3 });
    act(() => result.current.documentLoaded(10));
    readA.resolve({ position: 9, duration: 20 });
    await flushPromises();
    rerender({ fileId: "file-bbbbbbb", page: 4, requestedPage: 3 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-bbbbbbb", 4, 10);
  });

  it("does not let the previous file's read end the next file's read", async () => {
    const readA = deferredStored();
    const { result, rerender } = setup({ fileId: "file-aaaaaaa", page: 1 });
    act(() => result.current.documentLoaded(20));

    rerender({ fileId: "file-bbbbbbb", page: 1 });
    const readB = deferredStored();
    act(() => result.current.documentLoaded(10));
    readA.resolve({ position: 0, duration: 0 });
    await flushPromises();
    rerender({ fileId: "file-bbbbbbb", page: 4 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    readB.resolve({ position: 0, duration: 0 });
    await flushPromises();
    waitSaveDelay();
    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-bbbbbbb", 4, 10);
  });

  it("saves the next file's page even when it matches the previous file's", async () => {
    const { result, rerender } = await loaded();
    rerender({ fileId: "file-aaaaaaa", page: 5 });
    waitSaveDelay();

    rerender({ fileId: "file-bbbbbbb", page: 1 });
    act(() => result.current.documentLoaded(10));
    await flushPromises();
    rerender({ fileId: "file-bbbbbbb", page: 5 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenLastCalledWith("file-bbbbbbb", 5, 10);
  });

  it("flushes a pending save on unmount", async () => {
    const { rerender, unmount } = await loaded();

    rerender({ fileId: "file-aaaaaaa", page: 9 });
    unmount();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith("file-aaaaaaa", 9, 20);
  });

  it("saves to this device without a profile", async () => {
    withoutProfile();
    const { rerender } = await loaded();

    rerender({ fileId: "file-aaaaaaa", page: 5 });
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    expect(mockSaveProgress).toHaveBeenCalledWith("file-aaaaaaa", 5, 20);
  });
});
