import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { useArchiveSort } from "../useArchiveSort";
import type { ArchiveEntry } from "@/types";

function makeEntry(
  path: string,
  overrides: Partial<ArchiveEntry> = {}
): ArchiveEntry {
  const is_dir = path.endsWith("/");
  const filename = is_dir
    ? path.slice(0, -1).split("/").pop()!
    : path.split("/").pop()!;
  return {
    path,
    filename,
    file_size: 100,
    compressed_size: 50,
    file_type: "other",
    mime_type: "",
    is_dir,
    ...overrides,
  };
}

describe("useArchiveSort", () => {
  it("has default state: sort='name', order='asc', typeFilter=null", () => {
    const { result } = renderHook(() => useArchiveSort());

    expect(result.current.sort).toBe("name");
    expect(result.current.order).toBe("asc");
    expect(result.current.typeFilter).toBeNull();
  });

  it("applySortFilter places directories first regardless of sort", () => {
    const { result } = renderHook(() => useArchiveSort());
    const entries: ArchiveEntry[] = [
      makeEntry("alpha.txt", { file_type: "document" }),
      makeEntry("zfolder/"),
      makeEntry("beta.txt", { file_type: "document" }),
      makeEntry("afolder/"),
    ];

    const sorted = result.current.applySortFilter(entries);

    expect(sorted[0].is_dir).toBe(true);
    expect(sorted[1].is_dir).toBe(true);
    expect(sorted[2].is_dir).toBe(false);
    expect(sorted[3].is_dir).toBe(false);
  });

  it("sorts by name ascending (alphabetical) by default", () => {
    const { result } = renderHook(() => useArchiveSort());
    const entries: ArchiveEntry[] = [
      makeEntry("gamma.txt"),
      makeEntry("alpha.txt"),
      makeEntry("beta.txt"),
    ];

    const sorted = result.current.applySortFilter(entries);
    const names = sorted.map((e) => e.filename);

    expect(names).toEqual(["alpha.txt", "beta.txt", "gamma.txt"]);
  });

  it("sorts by name descending when order='desc'", () => {
    const { result } = renderHook(() => useArchiveSort());
    act(() => {
      result.current.setOrder("desc");
    });

    const entries: ArchiveEntry[] = [
      makeEntry("gamma.txt"),
      makeEntry("alpha.txt"),
      makeEntry("beta.txt"),
    ];

    const sorted = result.current.applySortFilter(entries);
    const names = sorted.map((e) => e.filename);

    expect(names).toEqual(["gamma.txt", "beta.txt", "alpha.txt"]);
  });

  it("sorts by size with directories treated as 0", () => {
    const { result } = renderHook(() => useArchiveSort());
    act(() => {
      result.current.setSort("size");
    });

    const entries: ArchiveEntry[] = [
      makeEntry("big.bin", { file_size: 9000 }),
      makeEntry("small.bin", { file_size: 100 }),
      makeEntry("mid.bin", { file_size: 500 }),
      makeEntry("dir/", { file_size: 0 }),
    ];

    const sorted = result.current.applySortFilter(entries);
    // Dir first, then ascending by size: 100, 500, 9000
    expect(sorted[0].is_dir).toBe(true);
    expect(sorted.slice(1).map((e) => e.filename)).toEqual([
      "small.bin",
      "mid.bin",
      "big.bin",
    ]);
  });

  it("sorts by type alphabetically when sort='type'", () => {
    const { result } = renderHook(() => useArchiveSort());
    act(() => {
      result.current.setSort("type");
    });

    const entries: ArchiveEntry[] = [
      makeEntry("video.mp4", { file_type: "video" }),
      makeEntry("audio.mp3", { file_type: "audio" }),
      makeEntry("image.jpg", { file_type: "image" }),
      makeEntry("doc.txt", { file_type: "document" }),
    ];

    const sorted = result.current.applySortFilter(entries);
    const types = sorted.map((e) => e.file_type);

    expect(types).toEqual(["audio", "document", "image", "video"]);
  });

  it("filters non-directory entries by typeFilter", () => {
    const { result } = renderHook(() => useArchiveSort());
    act(() => {
      result.current.setTypeFilter("image");
    });

    const entries: ArchiveEntry[] = [
      makeEntry("a.jpg", { file_type: "image" }),
      makeEntry("b.txt", { file_type: "document" }),
      makeEntry("c.mp4", { file_type: "video" }),
      makeEntry("d.png", { file_type: "image" }),
    ];

    const sorted = result.current.applySortFilter(entries);

    expect(sorted.every((e) => e.file_type === "image")).toBe(true);
    expect(sorted).toHaveLength(2);
  });

  it("keeps directories even when typeFilter is active", () => {
    const { result } = renderHook(() => useArchiveSort());
    act(() => {
      result.current.setTypeFilter("image");
    });

    const entries: ArchiveEntry[] = [
      makeEntry("folder/"),
      makeEntry("a.jpg", { file_type: "image" }),
      makeEntry("b.txt", { file_type: "document" }),
    ];

    const sorted = result.current.applySortFilter(entries);
    const dirs = sorted.filter((e) => e.is_dir);

    expect(dirs).toHaveLength(1);
    expect(dirs[0].filename).toBe("folder");
    // image file is kept, document file is dropped
    const files = sorted.filter((e) => !e.is_dir);
    expect(files).toHaveLength(1);
    expect(files[0].file_type).toBe("image");
  });
});
