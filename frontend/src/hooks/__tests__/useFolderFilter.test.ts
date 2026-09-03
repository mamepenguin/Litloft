/**
 * Tests for useFolderFilter — the right-pane (current folder) filter hook.
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §2.
 *
 * RED phase — the hook does not exist yet.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileItem, Folder } from "@/types";

import { useFolderFilter } from "../useFolderFilter";

function makeFolder(name: string): Folder {
  return {
    name,
    path: name,
    file_count: 0,
    thumbnail_file_id: null,
    dominant_kind: null,
  };
}

function makeFile(overrides: Partial<FileItem>): FileItem {
  return {
    id: overrides.id ?? "f",
    filename: overrides.filename ?? "a.mp4",
    title: overrides.title ?? overrides.filename ?? "a",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: overrides.file_type ?? "video",
    mime_type: overrides.mime_type ?? "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1,
    duration: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const sampleFiles: FileItem[] = [
  makeFile({ id: "1", filename: "spec.md", file_type: "document", mime_type: "text/markdown" }),
  makeFile({ id: "2", filename: "Notes.md", file_type: "document", mime_type: "text/markdown" }),
  makeFile({ id: "3", filename: "intro.mp4", file_type: "video", mime_type: "video/mp4" }),
  makeFile({ id: "4", filename: "outro.MOV", file_type: "video", mime_type: "video/quicktime" }),
  makeFile({ id: "5", filename: "photo.jpg", file_type: "image", mime_type: "image/jpeg" }),
  makeFile({ id: "6", filename: "manual.pdf", file_type: "document", mime_type: "application/pdf" }),
  makeFile({ id: "7", filename: "audio.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
];

describe("useFolderFilter", () => {
  it("returns all files unchanged when the text is empty", () => {
    const { result } = renderHook(() => useFolderFilter(sampleFiles));
    expect(result.current.files).toEqual(sampleFiles);
    expect(result.current.text).toBe("");
    expect(result.current.isActive).toBe(false);
  });

  it("filters by case-insensitive substring match on filename", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { result } = renderHook(() => useFolderFilter(sampleFiles));
    act(() => {
      result.current.setText("SPEC");
    });
    // Debounce 300ms.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const filenames = result.current.files.map((f) => f.filename);
    expect(filenames).toEqual(["spec.md"]);
    vi.useRealTimers();
  });

  it("no longer classifies — that is the toolbar's job, and the server's", () => {
    // This hook carried a second kind filter forty pixels below the
    // toolbar's. The toolbar asks the server; this sifted the rows
    // already loaded, so past the first page of thirty the same choice
    // gave two answers. The vocabulary and its one classifier now live
    // in the backend (tests/test_file_kind_filter.py).
    const { result } = renderHook(() => useFolderFilter(sampleFiles));
    expect(result.current).not.toHaveProperty("typeFilter");
    expect(result.current).not.toHaveProperty("setTypeFilter");
  });

  it("debounces text input by 300ms", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { result } = renderHook(() => useFolderFilter(sampleFiles));
    act(() => {
      result.current.setText("spec");
    });
    // Before debounce fires, files are still unfiltered.
    expect(result.current.files.length).toBe(sampleFiles.length);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.files.length).toBe(sampleFiles.length);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.files.length).toBe(1);
    vi.useRealTimers();
  });

  it("isActive tracks debouncedText timing so the empty-state doesn't flicker", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { result } = renderHook(() => useFolderFilter(sampleFiles));

    act(() => {
      result.current.setText("foo");
    });
    // Mid-debounce: text is set on the input, but the debounced filter
    // hasn't applied yet — isActive must still be false so the empty
    // state doesn't flash.
    expect(result.current.text).toBe("foo");
    expect(result.current.isActive).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isActive).toBe(true);
    vi.useRealTimers();
  });

  it("filters folders by case-insensitive substring match on folder name", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const folders = [makeFolder("Recipes"), makeFolder("Notes"), makeFolder("photos")];
    const { result } = renderHook(() => useFolderFilter(sampleFiles, folders));
    act(() => {
      result.current.setText("note");
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.folders.map((f) => f.name)).toEqual(["Notes"]);
    vi.useRealTimers();
  });

  it("returns folders unchanged when text is empty", () => {
    const folders = [makeFolder("a"), makeFolder("b")];
    const { result } = renderHook(() => useFolderFilter(sampleFiles, folders));
    expect(result.current.folders).toEqual(folders);
  });

  it("clear() resets the text", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { result } = renderHook(() => useFolderFilter(sampleFiles));
    act(() => {
      result.current.setText("foo");
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.text).toBe("");
    expect(result.current.isActive).toBe(false);
    expect(result.current.files).toEqual(sampleFiles);
    vi.useRealTimers();
  });

  beforeEach(() => {
    // ensure each test starts with real timers; some tests opt into fake timers locally.
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
