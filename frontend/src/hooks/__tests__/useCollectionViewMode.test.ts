import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  dominantCollectionKind,
  resolveCollectionViewMode,
  useCollectionViewMode,
} from "../useCollectionViewMode";
import type { CollectionItemEntry, FileItem } from "@/types";

function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
}

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const mockStorage = makeLocalStorageMock();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: mockStorage,
});

afterAll(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  }
});

beforeEach(() => {
  mockStorage.clear();
});

function makeFile(
  id: string,
  file_type: FileItem["file_type"],
  mime_type = "application/octet-stream",
  filename = `${id}.dat`,
): FileItem {
  return {
    id,
    filename,
    title: id,
    description: "",
    drive: "main",
    folder_path: "",
    file_type,
    mime_type,
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: null,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "",
    updated_at: "",
  };
}

function makeItem(file: FileItem, position = 0, id = position + 1): CollectionItemEntry {
  return { id, position, file };
}

describe("dominantCollectionKind", () => {
  it("returns null for empty input", () => {
    expect(dominantCollectionKind([])).toBeNull();
  });

  it("returns the majority kind when it exceeds half", () => {
    const items = [
      makeItem(makeFile("a", "document", "text/markdown", "a.md")),
      makeItem(makeFile("b", "document", "text/markdown", "b.md"), 1, 2),
      makeItem(makeFile("c", "video", "video/mp4"), 2, 3),
    ];
    expect(dominantCollectionKind(items)).toBe("markdown");
  });

  it("returns null when no kind exceeds half (tie / mixed)", () => {
    const items = [
      makeItem(makeFile("a", "document", "text/markdown", "a.md")),
      makeItem(makeFile("b", "video", "video/mp4"), 1, 2),
    ];
    expect(dominantCollectionKind(items)).toBeNull();
  });

  it("recognises .md by filename even with octet-stream mime", () => {
    const items = [
      makeItem(makeFile("a", "document", "application/octet-stream", "notes.md")),
      makeItem(makeFile("b", "document", "application/octet-stream", "notes2.md"), 1, 2),
      makeItem(makeFile("c", "video", "video/mp4"), 2, 3),
    ];
    expect(dominantCollectionKind(items)).toBe("markdown");
  });

  it("classifies PDFs separately from generic documents", () => {
    const items = [
      makeItem(makeFile("a", "document", "application/pdf", "a.pdf")),
      makeItem(makeFile("b", "document", "application/pdf", "b.pdf"), 1, 2),
    ];
    expect(dominantCollectionKind(items)).toBe("pdf");
  });
});

describe("resolveCollectionViewMode", () => {
  it("uses the per-collection override when one is stored", () => {
    mockStorage.setItem(
      "collectionPrefs:main",
      JSON.stringify({ c1: { viewMode: "list" } }),
    );
    expect(
      resolveCollectionViewMode({
        drive: "main",
        collectionId: "c1",
        dominantKind: "markdown",
      }),
    ).toBe("list");
  });

  it("auto-detects list for markdown-heavy collections", () => {
    expect(
      resolveCollectionViewMode({
        drive: "main",
        collectionId: "c1",
        dominantKind: "markdown",
      }),
    ).toBe("list");
  });

  it("auto-detects grid for video/image/audio", () => {
    expect(
      resolveCollectionViewMode({
        drive: "main",
        collectionId: "c1",
        dominantKind: "video",
      }),
    ).toBe("grid");
  });

  it("falls back to the global default when dominantKind doesn't map", () => {
    mockStorage.setItem("video-share-view-mode", "list");
    expect(
      resolveCollectionViewMode({
        drive: "main",
        collectionId: "c1",
        dominantKind: null,
      }),
    ).toBe("list");
  });

  it("ends at the grid built-in default when nothing else applies", () => {
    expect(
      resolveCollectionViewMode({
        drive: "main",
        collectionId: "c1",
        dominantKind: null,
      }),
    ).toBe("grid");
  });
});

describe("useCollectionViewMode", () => {
  it("persists an explicit setViewMode call", () => {
    const items = [makeItem(makeFile("a", "video", "video/mp4"))];
    const { result } = renderHook(() =>
      useCollectionViewMode({ drive: "main", collectionId: "c1", items }),
    );
    expect(result.current.viewMode).toBe("grid");
    act(() => result.current.setViewMode("list"));
    expect(result.current.viewMode).toBe("list");
    expect(
      JSON.parse(mockStorage.getItem("collectionPrefs:main") ?? "{}"),
    ).toEqual({ c1: { viewMode: "list" } });
  });

  it("re-resolves when dominantKind shifts", () => {
    const videoItems = [makeItem(makeFile("a", "video", "video/mp4"))];
    const markdownItems = [
      makeItem(makeFile("b", "document", "text/markdown", "b.md")),
      makeItem(makeFile("c", "document", "text/markdown", "c.md"), 1, 2),
    ];
    const { result, rerender } = renderHook(
      ({ items }) =>
        useCollectionViewMode({ drive: "main", collectionId: "c1", items }),
      { initialProps: { items: videoItems } },
    );
    expect(result.current.viewMode).toBe("grid");
    rerender({ items: markdownItems });
    expect(result.current.viewMode).toBe("list");
  });

  it("keeps the per-collection override even when items shift", () => {
    mockStorage.setItem(
      "collectionPrefs:main",
      JSON.stringify({ c1: { viewMode: "list" } }),
    );
    const items = [makeItem(makeFile("a", "video", "video/mp4"))];
    const { result } = renderHook(() =>
      useCollectionViewMode({ drive: "main", collectionId: "c1", items }),
    );
    expect(result.current.viewMode).toBe("list");
  });
});
