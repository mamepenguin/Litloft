import { describe, it, expect } from "vitest";
import {
  getDirname,
  getEntriesInDir,
  inferDirectories,
  INTERVAL_OPTIONS,
  MAX_TEXT_AUTO_LOAD,
} from "../archiveUtils";
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

describe("getDirname", () => {
  it("returns empty string for root-level file", () => {
    expect(getDirname("readme.txt")).toBe("");
  });

  it("returns parent directory for nested file", () => {
    expect(getDirname("photos/vacation/img.jpg")).toBe("photos/vacation");
  });

  it("returns parent for single-level path", () => {
    expect(getDirname("docs/file.txt")).toBe("docs");
  });
});

describe("getEntriesInDir", () => {
  const entries: ArchiveEntry[] = [
    makeEntry("file1.txt"),
    makeEntry("dir1/"),
    makeEntry("dir1/file2.txt"),
    makeEntry("dir1/subdir/"),
    makeEntry("dir1/subdir/file3.txt"),
    makeEntry("dir2/"),
    makeEntry("dir2/file4.txt"),
  ];

  it("returns root-level files and directories", () => {
    const result = getEntriesInDir(entries, "");
    const paths = result.map((e) => e.path);
    expect(paths).toContain("file1.txt");
    expect(paths).toContain("dir1/");
    expect(paths).toContain("dir2/");
    expect(paths).not.toContain("dir1/file2.txt");
  });

  it("returns direct children of a directory", () => {
    const result = getEntriesInDir(entries, "dir1");
    const paths = result.map((e) => e.path);
    expect(paths).toContain("dir1/file2.txt");
    expect(paths).toContain("dir1/subdir/");
    expect(paths).not.toContain("dir1/subdir/file3.txt");
  });

  it("returns entries in nested directory", () => {
    const result = getEntriesInDir(entries, "dir1/subdir");
    const paths = result.map((e) => e.path);
    expect(paths).toContain("dir1/subdir/file3.txt");
    expect(paths).toHaveLength(1);
  });

  it("returns empty for non-existent directory", () => {
    const result = getEntriesInDir(entries, "nonexistent");
    expect(result).toHaveLength(0);
  });

  it("excludes the directory entry that represents the current dir itself", () => {
    const result = getEntriesInDir(entries, "dir1");
    const paths = result.map((e) => e.path);
    expect(paths).not.toContain("dir1/");
  });
});

describe("inferDirectories", () => {
  it("infers missing directory entries from file paths", () => {
    const entries: ArchiveEntry[] = [
      makeEntry("photos/img1.jpg", { file_type: "image" }),
      makeEntry("photos/img2.jpg", { file_type: "image" }),
      makeEntry("docs/readme.txt"),
    ];
    const inferred = inferDirectories(entries, "");
    const names = inferred.map((e) => e.filename);
    expect(names).toContain("photos");
    expect(names).toContain("docs");
    expect(inferred.every((e) => e.is_dir)).toBe(true);
  });

  it("does not infer directories that already exist as explicit entries", () => {
    const entries: ArchiveEntry[] = [
      makeEntry("photos/"),
      makeEntry("photos/img1.jpg", { file_type: "image" }),
    ];
    const inferred = inferDirectories(entries, "");
    expect(inferred).toHaveLength(0);
  });

  it("infers subdirectories within a given path", () => {
    const entries: ArchiveEntry[] = [
      makeEntry("photos/vacation/img.jpg", { file_type: "image" }),
    ];
    const inferred = inferDirectories(entries, "photos");
    expect(inferred).toHaveLength(1);
    expect(inferred[0].filename).toBe("vacation");
    expect(inferred[0].path).toBe("photos/vacation/");
  });

  it("returns empty when no implicit directories exist", () => {
    const entries: ArchiveEntry[] = [
      makeEntry("file1.txt"),
      makeEntry("file2.txt"),
    ];
    const inferred = inferDirectories(entries, "");
    expect(inferred).toHaveLength(0);
  });
});

describe("constants", () => {
  it("INTERVAL_OPTIONS contains expected values", () => {
    expect(INTERVAL_OPTIONS).toEqual([3, 5, 10]);
  });

  it("MAX_TEXT_AUTO_LOAD is 1MB", () => {
    expect(MAX_TEXT_AUTO_LOAD).toBe(1024 * 1024);
  });
});
