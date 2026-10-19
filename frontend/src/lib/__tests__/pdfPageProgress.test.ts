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
  requestedPage?: number;
}

function setup(initial: Props) {
  const goTo = vi.fn();
  const hook = renderHook(
    (props: Props) => usePdfPageProgress({ ...props, goTo }),
    { initialProps: initial },
  );
  const load = (n: number) => act(() => hook.result.current.documentLoaded(n));
  const turn = (page: number) => act(() => hook.result.current.pageTurned(page));
  return { ...hook, goTo, load, turn };
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

const A = "file-aaaaaaa";
const B = "file-bbbbbbb";

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
    const { load, goTo } = setup({ fileId: A });
    expect(mockGetWatchProgress).not.toHaveBeenCalled();

    load(20);
    await flushPromises();

    expect(mockGetWatchProgress).toHaveBeenCalledWith(A);
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
    const { load, goTo } = setup({ fileId: A });

    load(20);
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("does not read the stored page when a page was requested", async () => {
    stored(7);
    const { load, goTo } = setup({ fileId: A, requestedPage: 3 });

    load(20);
    await flushPromises();

    expect(mockGetWatchProgress).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
  });

  it("drops the stored page when a page is requested while it is read", async () => {
    const read = deferredStored();
    const { load, rerender, goTo } = setup({ fileId: A });

    load(20);
    rerender({ fileId: A, requestedPage: 1 });
    read.resolve({ position: 7, duration: 20 });
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("drops the stored page when the reader turns while it is read", async () => {
    const read = deferredStored();
    const { load, turn, goTo } = setup({ fileId: A });

    load(20);
    turn(1);
    read.resolve({ position: 7, duration: 20 });
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("drops a stored page that arrives after the file changed", async () => {
    const read = deferredStored();
    const { load, rerender, goTo } = setup({ fileId: A });

    load(20);
    rerender({ fileId: B });
    read.resolve({ position: 7, duration: 20 });
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("restores only once per file", async () => {
    stored(7);
    const { load, goTo } = setup({ fileId: A });

    load(20);
    await flushPromises();
    load(20);
    await flushPromises();

    expect(mockGetWatchProgress).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  it("restores again for the next file", async () => {
    stored(7);
    const { load, rerender, goTo } = setup({ fileId: A });
    load(20);
    await flushPromises();

    stored(4, 10);
    rerender({ fileId: B });
    load(10);
    await flushPromises();

    expect(goTo).toHaveBeenLastCalledWith(4);
  });

  it("restores again on coming back to a file whose neighbour never loaded", async () => {
    stored(7);
    const { load, rerender, goTo } = setup({ fileId: A });
    load(20);
    await flushPromises();

    rerender({ fileId: B });
    rerender({ fileId: A });
    load(20);
    await flushPromises();

    expect(goTo).toHaveBeenCalledTimes(2);
    expect(goTo).toHaveBeenLastCalledWith(7);
  });

  it("acts on the latest read only, when a file is left and reopened mid-read", async () => {
    const first = deferredStored();
    const { load, rerender, turn, goTo } = setup({ fileId: A });
    load(20);
    rerender({ fileId: B });
    rerender({ fileId: A });
    const second = deferredStored();
    load(20);

    first.resolve({ position: 0, duration: 0 });
    await flushPromises();
    turn(4);
    second.resolve({ position: 9, duration: 20 });
    await flushPromises();

    expect(goTo).not.toHaveBeenCalled();
  });

  it("reads this device's record without a profile", async () => {
    withoutProfile();
    mockGetSavedProgress.mockReturnValue(6);
    const { load, goTo } = setup({ fileId: A });

    load(20);
    await flushPromises();

    expect(mockGetWatchProgress).not.toHaveBeenCalled();
    expect(mockGetSavedProgress).toHaveBeenCalledWith(A);
    expect(goTo).toHaveBeenCalledWith(6);
  });
});

describe("usePdfPageProgress save", () => {
  async function loaded(fileId = A, n = 20) {
    const hook = setup({ fileId });
    hook.load(n);
    await flushPromises();
    return hook;
  }

  it("saves a turned page and the page count after the delay", async () => {
    const { turn } = await loaded();

    turn(5);
    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith(A, 5, 20);
  });

  it("writes one save for a run of turns", async () => {
    const { turn } = await loaded();

    turn(2);
    turn(3);
    turn(4);
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveWatchProgress).toHaveBeenCalledWith(A, 4, 20);
  });

  it("never writes page 1", async () => {
    const { turn } = await loaded();

    turn(5);
    waitSaveDelay();
    turn(1);
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveWatchProgress).toHaveBeenCalledWith(A, 5, 20);
  });

  it.each([
    ["past the end", 21],
    ["not a page", 2.5],
  ])("writes nothing for a turn %s", async (_label, page) => {
    const { turn } = await loaded();

    turn(page);
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("writes nothing for a restore", async () => {
    stored(7);
    await loaded();
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("writes nothing before the document has loaded", () => {
    const { turn } = setup({ fileId: A });

    turn(5);
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("saves a turn made while the stored page is being read", async () => {
    const read = deferredStored();
    const { load, turn } = setup({ fileId: A });
    load(20);

    turn(3);
    waitSaveDelay();
    expect(mockSaveWatchProgress).toHaveBeenCalledWith(A, 3, 20);

    read.resolve({ position: 9, duration: 20 });
    await flushPromises();
    waitSaveDelay();
    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
  });

  it("saves again after a failed read", async () => {
    const read = deferredStored();
    const { load, turn } = setup({ fileId: A });
    load(20);
    read.reject(new Error("offline"));
    await flushPromises();

    turn(4);
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith(A, 4, 20);
  });

  it("flushes a pending save to the previous file when the file changes", async () => {
    const { turn, rerender } = await loaded();

    turn(6);
    rerender({ fileId: B });

    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
    expect(mockSaveWatchProgress).toHaveBeenCalledWith(A, 6, 20);
    waitSaveDelay();
    expect(mockSaveWatchProgress).toHaveBeenCalledTimes(1);
  });

  it("ignores a turn after the file changed and before the next one loads", async () => {
    const { turn, rerender } = await loaded();

    rerender({ fileId: B });
    turn(6);
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
  });

  it("saves the next file's turns against its own page count", async () => {
    const { turn, rerender, load } = await loaded();

    rerender({ fileId: B });
    load(10);
    await flushPromises();
    turn(5);
    waitSaveDelay();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith(B, 5, 10);
  });

  it("flushes a pending save on unmount", async () => {
    const { turn, unmount } = await loaded();

    turn(9);
    unmount();

    expect(mockSaveWatchProgress).toHaveBeenCalledWith(A, 9, 20);
  });

  it("saves to this device without a profile", async () => {
    withoutProfile();
    const { turn } = await loaded();

    turn(5);
    waitSaveDelay();

    expect(mockSaveWatchProgress).not.toHaveBeenCalled();
    expect(mockSaveProgress).toHaveBeenCalledWith(A, 5, 20);
  });
});
