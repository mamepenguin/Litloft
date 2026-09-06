import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveFolderViewMode, useFolderSort, useFolderViewMode } from "../useFolderViewMode";
import type { FolderKind } from "@/types";

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

  it.each([
    ["audio", "list"],
    ["archive", "list"],
    ["other", "list"],
    ["document", "grid"],
    ["pdf", "grid"],
  ] as const)(
    "opens a %s-dominant folder as a %s, like a collection of the same",
    (dominantKind, expected) => {
      // The folder half of the change, and the half with the wider blast
      // radius — every folder page, not just collections. Asserted on
      // behaviour so a re-introduced local table fails here and not only
      // in a source scan.
      localStorage.setItem(GLOBAL_KEY, expected === "grid" ? "list" : "grid");
      expect(
        resolveFolderViewMode({ drive: "work", folderPath: "f", dominantKind }),
      ).toBe(expected);
    },
  );

  it("layer 3 is reached only by a mixed folder", () => {
    // `viewModeForKind` is total over `FolderKind` now, so every folder
    // with a dominant kind is answered at layer 2 — `document` used to
    // fall through here, on the strength of a `default:` arm rather than
    // of a decision about what its cards look like. The global default
    // is what a folder with *no* dominant kind falls back to.
    localStorage.setItem(GLOBAL_KEY, "list");
    expect(
      resolveFolderViewMode({
        drive: "work",
        folderPath: "docs",
        dominantKind: "document",
      }),
    ).toBe("grid");
    expect(
      resolveFolderViewMode({
        drive: "work",
        folderPath: "mixed",
        dominantKind: null,
      }),
    ).toBe("list");
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

  it("falls back to the default when the stored field was retired", () => {
    // A sort selection outlives the deploy that removes it. "likes" was
    // stored per folder, so without this fallback that folder would send
    // a rejected sort on every load until localStorage was cleared by
    // hand (spec 2026-09-01-favorite-like-separation).
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ Q1: { sort: "likes", order: "desc" } }),
    );
    const { result } = renderHook(() =>
      useFolderSort({ drive: "work", folderPath: "Q1" }),
    );
    expect(result.current.sort).toBe("created_at");
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

describe("useFolderViewMode holds the mode a folder opened in", () => {
  it("does not restyle a folder as later pages arrive", () => {
    // The dominant kind is derived from the pages loaded so far, so
    // without a latch a folder whose first page is mostly audio opens as
    // a list and its next page of video turns it into a grid mid-scroll.
    const { result, rerender } = renderHook(
      ({ dominantKind }) =>
        useFolderViewMode({ drive: "work", folderPath: "album", dominantKind }),
      { initialProps: { dominantKind: "audio" as FolderKind | null } },
    );
    expect(result.current.viewMode).toBe("list");

    rerender({ dominantKind: "video" });
    expect(result.current.viewMode).toBe("list");
  });

  it("takes the first real answer, not the empty first render", () => {
    // A folder mounts before its files arrive, so the first render
    // reports no dominant kind. `null` does not latch.
    const { result, rerender } = renderHook(
      ({ dominantKind }) =>
        useFolderViewMode({ drive: "work", folderPath: "album", dominantKind }),
      { initialProps: { dominantKind: null as FolderKind | null } },
    );
    rerender({ dominantKind: "audio" });
    expect(result.current.viewMode).toBe("list");
  });

  it("starts over in a different folder", () => {
    const { result, rerender } = renderHook(
      ({ folderPath, dominantKind }) =>
        useFolderViewMode({ drive: "work", folderPath, dominantKind }),
      {
        initialProps: {
          folderPath: "album",
          dominantKind: "audio" as FolderKind | null,
        },
      },
    );
    expect(result.current.viewMode).toBe("list");

    rerender({ folderPath: "clips", dominantKind: "video" });
    expect(result.current.viewMode).toBe("grid");
  });

  it("keeps an explicit choice, and remembers it for the folder", () => {
    const { result } = renderHook(() =>
      useFolderViewMode({ drive: "work", folderPath: "album", dominantKind: "audio" }),
    );
    expect(result.current.viewMode).toBe("list");

    act(() => result.current.setViewMode("grid"));
    expect(result.current.viewMode).toBe("grid");

    const fresh = renderHook(() =>
      useFolderViewMode({ drive: "work", folderPath: "album", dominantKind: "audio" }),
    );
    expect(fresh.result.current.viewMode).toBe("grid");
  });
});
