import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFolderTreeQuery } from "../useFolderTreeQuery";

const mockGetFolderTree = vi.fn();
vi.mock("@/lib/api", () => ({
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
}));

beforeEach(() => {
  mockGetFolderTree.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFolderTreeQuery", () => {
  it("fetches root on mount", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "folder", name: "Q1", path: "Q1", file_count: 3, has_children: true },
    ]);

    const { result } = renderHook(() =>
      useFolderTreeQuery({ drive: "work", typeFilter: null, pathsToLoad: new Set([""]) }),
    );

    await waitFor(() => {
      expect(result.current.childrenByPath.has("")).toBe(true);
    });
    expect(result.current.childrenByPath.get("")).toHaveLength(1);
    expect(mockGetFolderTree).toHaveBeenCalledWith(
      "work",
      { root: "", type_filter: null, depth: 1 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("fetches expanded folders separately", async () => {
    mockGetFolderTree
      .mockResolvedValueOnce([
        { kind: "folder", name: "Q1", path: "Q1", file_count: 3, has_children: true },
      ])
      .mockResolvedValueOnce([
        { kind: "file", name: "a.md", path: "Q1/a.md", file_id: "f1", file_type: "document", mime_type: "text/markdown" },
      ]);

    const { result, rerender } = renderHook(
      ({ pathsToLoad }: { pathsToLoad: Set<string> }) =>
        useFolderTreeQuery({ drive: "work", typeFilter: null, pathsToLoad }),
      { initialProps: { pathsToLoad: new Set([""]) } },
    );

    await waitFor(() => expect(result.current.childrenByPath.has("")).toBe(true));

    rerender({ pathsToLoad: new Set(["", "Q1"]) });

    await waitFor(() => expect(result.current.childrenByPath.has("Q1")).toBe(true));
    expect(result.current.childrenByPath.get("Q1")).toHaveLength(1);
    expect(mockGetFolderTree).toHaveBeenCalledTimes(2);
  });

  it("drops cache when typeFilter changes", async () => {
    mockGetFolderTree.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ typeFilter }: { typeFilter: "markdown" | null }) =>
        useFolderTreeQuery({ drive: "work", typeFilter, pathsToLoad: new Set([""]) }),
      { initialProps: { typeFilter: null as "markdown" | null } },
    );

    await waitFor(() => expect(result.current.childrenByPath.has("")).toBe(true));
    expect(mockGetFolderTree).toHaveBeenCalledTimes(1);

    rerender({ typeFilter: "markdown" });

    await waitFor(() => expect(mockGetFolderTree).toHaveBeenCalledTimes(2));
    expect(mockGetFolderTree).toHaveBeenLastCalledWith(
      "work",
      { root: "", type_filter: "markdown", depth: 1 },
      expect.any(Object),
    );
  });

  it("captures error message on fetch failure", async () => {
    mockGetFolderTree.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useFolderTreeQuery({ drive: "work", typeFilter: null, pathsToLoad: new Set([""]) }),
    );

    await waitFor(() => expect(result.current.errors.has("")).toBe(true));
    expect(result.current.errors.get("")).toBe("boom");
  });
});
