import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveFolderViewMode, useFolderSort, useFolderViewMode } from "../useFolderViewMode";

const GLOBAL_KEY = "video-share-view-mode";
const driveKey = (drive: string) => `folderPrefs:${drive}`;

function resetStorage() {
  localStorage.removeItem(GLOBAL_KEY);
  localStorage.removeItem(driveKey("work"));
  localStorage.removeItem(driveKey("photos"));
}

beforeEach(resetStorage);
afterEach(resetStorage);

describe("resolveFolderViewMode (layered fallback, grid|list)", () => {
  it("layer 1: per-folder override wins over everything", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ Q1: { viewMode: "list" } }),
    );
    localStorage.setItem(GLOBAL_KEY, "grid");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "Q1",
      dominantKind: "video",
    });
    expect(result).toBe("list");
  });

  it("layer 2: dominant_kind=markdown auto-detects list", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "notes",
      dominantKind: "markdown",
    });
    expect(result).toBe("list");
  });

  it("layer 2: dominant_kind=video auto-detects grid", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "videos",
      dominantKind: "video",
    });
    expect(result).toBe("grid");
  });

  it("layer 2: dominant_kind=image auto-detects grid", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "images",
      dominantKind: "image",
    });
    expect(result).toBe("grid");
  });

  it("layer 3: global default when no override or auto-detect", () => {
    localStorage.setItem(GLOBAL_KEY, "list");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "mixed",
      dominantKind: null,
    });
    expect(result).toBe("list");
  });

  it("layer 3: dominant_kind=document falls through to global", () => {
    localStorage.setItem(GLOBAL_KEY, "list");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "docs",
      dominantKind: "document",
    });
    expect(result).toBe("list");
  });

  it("layer 4: built-in default = grid", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "anything",
      dominantKind: null,
    });
    expect(result).toBe("grid");
  });

  it("drive root uses empty string as folder path key", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ "": { viewMode: "list" } }),
    );
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "",
      dominantKind: null,
    });
    expect(result).toBe("list");
  });

  it("ignores corrupt JSON in folderPrefs", () => {
    localStorage.setItem(driveKey("work"), "{ broken");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "Q1",
      dominantKind: null,
    });
    expect(result).toBe("grid");
  });

  it("ignores legacy 'two-pane' values from older sessions", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ Q1: { viewMode: "two-pane" } }),
    );
    localStorage.setItem(GLOBAL_KEY, "two-pane");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "Q1",
      dominantKind: null,
    });
    expect(result).toBe("grid");
  });
});

describe("useFolderSort", () => {
  it("defaults to created_at/desc when no prefs stored", () => {
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    expect(result.current.sort).toBe("created_at");
    expect(result.current.order).toBe("desc");
  });

  it("reads stored sort/order from folderPrefs", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ Q1: { sort: "title", order: "asc" } }),
    );
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    expect(result.current.sort).toBe("title");
    expect(result.current.order).toBe("asc");
  });

  it("writes sort/order to folderPrefs on setSort", () => {
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    act(() => result.current.setSort("file_size", "asc"));
    expect(result.current.sort).toBe("file_size");
    expect(result.current.order).toBe("asc");
    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored).toEqual({ Q1: { sort: "file_size", order: "asc" } });
  });

  it("preserves viewMode when updating sort", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ Q1: { viewMode: "list", sort: "title", order: "desc" } }),
    );
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    act(() => result.current.setSort("file_size", "asc"));
    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored.Q1).toEqual({ viewMode: "list", sort: "file_size", order: "asc" });
  });

  it("preserves entries for other folders", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ photos: { sort: "created_at", order: "desc" } }),
    );
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    act(() => result.current.setSort("title", "asc"));
    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored.photos).toEqual({ sort: "created_at", order: "desc" });
    expect(stored.Q1).toEqual({ sort: "title", order: "asc" });
  });

  it("re-resolves when folderPath changes", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({
        Q1: { sort: "title", order: "asc" },
        photos: { sort: "file_size", order: "desc" },
      }),
    );
    const { result, rerender } = renderHook(
      ({ folderPath }: { folderPath: string }) =>
        useFolderSort({ drive: "work", folderPath }),
      { initialProps: { folderPath: "Q1" } },
    );
    expect(result.current.sort).toBe("title");
    rerender({ folderPath: "photos" });
    expect(result.current.sort).toBe("file_size");
    expect(result.current.order).toBe("desc");
  });

  it("ignores unknown sort field values", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ Q1: { sort: "bogus", order: "desc" } }),
    );
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    expect(result.current.sort).toBe("created_at");
  });

  it("ignores unknown order values", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ Q1: { sort: "title", order: "sideways" } }),
    );
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    expect(result.current.order).toBe("desc");
  });
});

describe("useFolderViewMode setter", () => {
  it("writes per-folder override to folderPrefs:{drive}", () => {
    const { result } = renderHook(() =>
      useFolderViewMode({
        drive: "work",
        folderPath: "Q1",
        dominantKind: null,
      }),
    );

    act(() => result.current.setViewMode("list"));

    expect(result.current.viewMode).toBe("list");
    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored).toEqual({ Q1: { viewMode: "list" } });
  });

  it("preserves entries for other folders when updating", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ photos: { viewMode: "grid" } }),
    );
    const { result } = renderHook(() =>
      useFolderViewMode({
        drive: "work",
        folderPath: "Q1",
        dominantKind: null,
      }),
    );

    act(() => result.current.setViewMode("list"));

    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored).toEqual({
      photos: { viewMode: "grid" },
      Q1: { viewMode: "list" },
    });
  });

  it("re-resolves when folderPath changes", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({
        Q1: { viewMode: "list" },
        photos: { viewMode: "grid" },
      }),
    );

    const { result, rerender } = renderHook(
      ({ folderPath }: { folderPath: string }) =>
        useFolderViewMode({
          drive: "work",
          folderPath,
          dominantKind: null,
        }),
      { initialProps: { folderPath: "Q1" } },
    );

    expect(result.current.viewMode).toBe("list");

    rerender({ folderPath: "photos" });
    expect(result.current.viewMode).toBe("grid");
  });
});
