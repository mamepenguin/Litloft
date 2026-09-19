import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFileDetailData } from "../hooks/useFileDetailData";
import { _resetFileSeedForTests, seedFiles } from "@/lib/fileSeed";
import type { FileItem } from "@/types";

const apiMocks = vi.hoisted(() => ({
  getFile: vi.fn(),
  getFileShared: vi.fn(),
  recordFileView: vi.fn(),
  renameFile: vi.fn(),
  updateFile: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));

function file(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    title: "seed title",
    description: "seed desc",
    filename: "a.mp4",
    tags: [],
    ...overrides,
  } as FileItem;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  _resetFileSeedForTests();
});

describe("useFileDetailData with a seed", () => {
  it("draws the seed before the request answers", () => {
    seedFiles([file()]);
    apiMocks.getFileShared.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFileDetailData("f1"));
    expect(result.current.file?.title).toBe("seed title");
    expect(result.current.fresh).toBe(false);
  });

  it("has the seed in its very first render, not after an effect", () => {
    seedFiles([file()]);
    apiMocks.getFileShared.mockReturnValue(new Promise(() => {}));
    const titles: Array<string | undefined> = [];
    renderHook(() => {
      const data = useFileDetailData("f1");
      titles.push(data.file?.title);
      return data;
    });
    expect(titles[0]).toBe("seed title");
  });

  it("replaces the seed with the answer, even when they differ", async () => {
    seedFiles([file()]);
    apiMocks.getFileShared.mockResolvedValue(file({ title: "server title" }));
    const { result } = renderHook(() => useFileDetailData("f1"));
    await waitFor(() => expect(result.current.fresh).toBe(true));
    expect(result.current.file?.title).toBe("server title");
    expect(result.current.editTitle).toBe("server title");
  });

  it("asks once per open", async () => {
    seedFiles([file()]);
    apiMocks.getFileShared.mockResolvedValue(file());
    const { result } = renderHook(() => useFileDetailData("f1"));
    await waitFor(() => expect(result.current.fresh).toBe(true));
    expect(apiMocks.getFileShared).toHaveBeenCalledTimes(1);
    expect(apiMocks.getFile).not.toHaveBeenCalled();
    expect(apiMocks.recordFileView).toHaveBeenCalledTimes(1);
  });

  it("does not turn chapters on from a seed", async () => {
    seedFiles([file({ has_chapters: true } as Partial<FileItem>)]);
    const answer = deferred<FileItem>();
    apiMocks.getFileShared.mockReturnValue(answer.promise);
    const { result } = renderHook(() => useFileDetailData("f1"));
    expect(result.current.chaptersPresent).toBe(false);
    await act(async () => {
      answer.resolve(file({ has_chapters: true } as Partial<FileItem>));
    });
    expect(result.current.chaptersPresent).toBe(true);
  });

  it("writes nothing until the answer arrives", async () => {
    seedFiles([file()]);
    apiMocks.getFileShared.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFileDetailData("f1"));
    act(() => result.current.startEditing());
    expect(result.current.editing).toBe(false);
    await act(async () => {
      await result.current.save();
      await result.current.rename("b.mp4");
    });
    expect(apiMocks.updateFile).not.toHaveBeenCalled();
    expect(apiMocks.renameFile).not.toHaveBeenCalled();
  });

  it("an answer for a file already left does not replace the one on screen", async () => {
    seedFiles([file({ id: "f1", title: "one" }), file({ id: "f2", title: "two" })]);
    const first = deferred<FileItem>();
    apiMocks.getFileShared.mockImplementation((id: string) =>
      id === "f1" ? first.promise : new Promise(() => {}),
    );
    const { result, rerender } = renderHook(({ id }) => useFileDetailData(id), {
      initialProps: { id: "f1" },
    });
    rerender({ id: "f2" });
    await act(async () => {
      first.resolve(file({ id: "f1", title: "one from server" }));
    });
    expect(result.current.file?.title).toBe("two");
  });
});

describe("useFileDetailData when the file changes in place", () => {
  it("hands back the next file from the first render after the change", async () => {
    seedFiles([file({ id: "f1", title: "one" }), file({ id: "f2", title: "two" })]);
    apiMocks.getFileShared.mockImplementation((id: string) =>
      id === "f1" ? Promise.resolve(file({ id: "f1", title: "one" })) : new Promise(() => {}),
    );
    const seen: Array<[string, string | undefined]> = [];
    const { result, rerender } = renderHook(
      ({ id }) => {
        const data = useFileDetailData(id);
        seen.push([id, data.file?.id]);
        return data;
      },
      { initialProps: { id: "f1" } },
    );
    await waitFor(() => expect(result.current.fresh).toBe(true));
    seen.length = 0;
    rerender({ id: "f2" });
    expect(seen[0]).toEqual(["f2", "f2"]);
  });

  it("is not fresh again until the next file answers, and writes nothing", async () => {
    seedFiles([file({ id: "f1" }), file({ id: "f2", title: "seed two" })]);
    apiMocks.getFileShared.mockImplementation((id: string) =>
      id === "f1" ? Promise.resolve(file({ id: "f1" })) : new Promise(() => {}),
    );
    const { result, rerender } = renderHook(({ id }) => useFileDetailData(id), {
      initialProps: { id: "f1" },
    });
    await waitFor(() => expect(result.current.fresh).toBe(true));
    rerender({ id: "f2" });
    expect(result.current.fresh).toBe(false);
    act(() => result.current.startEditing());
    await act(async () => {
      await result.current.save();
    });
    expect(apiMocks.updateFile).not.toHaveBeenCalled();
  });

  it("a write answered for the file already left does not replace the one on screen", async () => {
    seedFiles([file({ id: "f1" }), file({ id: "f2", title: "two" })]);
    apiMocks.getFileShared.mockImplementation((id: string) =>
      Promise.resolve(file({ id, title: id === "f1" ? "one" : "two" })),
    );
    const { result, rerender } = renderHook(({ id }) => useFileDetailData(id), {
      initialProps: { id: "f1" },
    });
    await waitFor(() => expect(result.current.fresh).toBe(true));
    const setFileOfOne = result.current.setFile;
    rerender({ id: "f2" });
    await waitFor(() => expect(result.current.fresh).toBe(true));
    act(() => setFileOfOne(file({ id: "f1", title: "one renamed" })));
    expect(result.current.file?.title).toBe("two");
  });
});

describe("useFileDetailData when the file cannot be read", () => {
  it("drops the seed and says so", async () => {
    seedFiles([file()]);
    apiMocks.getFileShared.mockRejectedValue(new Error("API error: 404"));
    const { result } = renderHook(() => useFileDetailData("f1"));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.file).toBeNull();
  });
});

describe("useFileDetailData without a seed", () => {
  it("has no file until the request answers", async () => {
    apiMocks.getFileShared.mockResolvedValue(file());
    const { result } = renderHook(() => useFileDetailData("f1"));
    expect(result.current.file).toBeNull();
    await waitFor(() => expect(result.current.file).not.toBeNull());
  });
});
