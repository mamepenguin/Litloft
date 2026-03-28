import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useArchiveNavigation } from "../useArchiveNavigation";
import type { ArchiveContents, ArchiveEntry } from "@/types";

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

const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
} as any;

const sampleArchive: ArchiveContents = {
  entries: [
    makeEntry("photos/"),
    makeEntry("photos/img1.jpg", { file_type: "image" }),
    makeEntry("photos/img2.png", { file_type: "image" }),
    makeEntry("photos/sub/"),
    makeEntry("photos/sub/deep.jpg", { file_type: "image" }),
    makeEntry("readme.txt"),
    makeEntry("docs/"),
    makeEntry("docs/guide.pdf"),
  ],
  total_entries: 8,
  total_size: 1000,
};

describe("useArchiveNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns root-level entries sorted: dirs first, then alphabetical", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "", "", mockRouter)
    );
    const paths = result.current.currentEntries.map((e) => e.path);
    // dirs first
    expect(paths[0]).toBe("docs/");
    expect(paths[1]).toBe("photos/");
    // then files
    expect(paths[2]).toBe("readme.txt");
  });

  it("returns entries for a subdirectory", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "photos", "", mockRouter)
    );
    const paths = result.current.currentEntries.map((e) => e.path);
    expect(paths).toContain("photos/sub/");
    expect(paths).toContain("photos/img1.jpg");
    expect(paths).toContain("photos/img2.png");
    expect(paths).not.toContain("photos/sub/deep.jpg");
  });

  it("returns only images in current dir for imageEntries", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "photos", "", mockRouter)
    );
    expect(result.current.imageEntries).toHaveLength(2);
    expect(result.current.imageEntries.every((e) => e.file_type === "image")).toBe(true);
  });

  it("does not include images from subdirectories in imageEntries", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "photos", "", mockRouter)
    );
    const paths = result.current.imageEntries.map((e) => e.path);
    expect(paths).not.toContain("photos/sub/deep.jpg");
  });

  it("builds breadcrumbs from path", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "photos/sub", "", mockRouter)
    );
    expect(result.current.breadcrumbs).toEqual([
      { label: "Archive", path: "" },
      { label: "photos", path: "photos" },
      { label: "sub", path: "photos/sub" },
    ]);
  });

  it("builds root-only breadcrumb when path is empty", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "", "", mockRouter)
    );
    expect(result.current.breadcrumbs).toEqual([
      { label: "Archive", path: "" },
    ]);
  });

  it("navigateArchive pushes URL with archivePath param", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "", "", mockRouter)
    );
    act(() => {
      result.current.navigateArchive("photos/sub");
    });
    expect(mockPush).toHaveBeenCalledWith("?archivePath=photos%2Fsub");
  });

  it("navigateArchive removes archivePath when navigating to root", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(sampleArchive, "photos", "archivePath=photos", mockRouter)
    );
    act(() => {
      result.current.navigateArchive("");
    });
    expect(mockPush).toHaveBeenCalledWith(window.location.pathname);
  });

  it("returns empty entries when archive is null", () => {
    const { result } = renderHook(() =>
      useArchiveNavigation(null, "", "", mockRouter)
    );
    expect(result.current.currentEntries).toHaveLength(0);
    expect(result.current.imageEntries).toHaveLength(0);
  });
});
