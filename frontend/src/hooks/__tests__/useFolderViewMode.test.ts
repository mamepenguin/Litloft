import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveFolderViewMode, useFolderViewMode } from "../useFolderViewMode";

const GLOBAL_KEY = "video-share-view-mode";
const driveKey = (drive: string) => `folderPrefs:${drive}`;

function resetStorage() {
  localStorage.removeItem(GLOBAL_KEY);
  localStorage.removeItem(driveKey("work"));
  localStorage.removeItem(driveKey("photos"));
}

beforeEach(resetStorage);
afterEach(resetStorage);

describe("resolveFolderViewMode (layered fallback)", () => {
  it("layer 1: per-folder override wins over everything", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ "Q1": { viewMode: "list" } }),
    );
    localStorage.setItem(GLOBAL_KEY, "two-pane");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "Q1",
      dominantKind: "video",
      twoPaneAllowed: true,
    });
    expect(result).toBe("list");
  });

  it("layer 2: dominant_kind=markdown auto-detects two-pane", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "notes",
      dominantKind: "markdown",
      twoPaneAllowed: true,
    });
    expect(result).toBe("two-pane");
  });

  it("layer 2: dominant_kind=video auto-detects grid", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "videos",
      dominantKind: "video",
      twoPaneAllowed: true,
    });
    expect(result).toBe("grid");
  });

  it("layer 2: dominant_kind=image auto-detects grid", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "images",
      dominantKind: "image",
      twoPaneAllowed: true,
    });
    expect(result).toBe("grid");
  });

  it("layer 3: global default when no override or auto-detect", () => {
    localStorage.setItem(GLOBAL_KEY, "list");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "mixed",
      dominantKind: null,
      twoPaneAllowed: true,
    });
    expect(result).toBe("list");
  });

  it("layer 3: dominant_kind=document falls through to global", () => {
    localStorage.setItem(GLOBAL_KEY, "list");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "docs",
      dominantKind: "document",
      twoPaneAllowed: true,
    });
    expect(result).toBe("list");
  });

  it("layer 4: built-in default = grid", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "anything",
      dominantKind: null,
      twoPaneAllowed: true,
    });
    expect(result).toBe("grid");
  });

  it("twoPaneAllowed=false clamps override two-pane to next layer", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ "Q1": { viewMode: "two-pane" } }),
    );
    localStorage.setItem(GLOBAL_KEY, "list");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "Q1",
      dominantKind: null,
      twoPaneAllowed: false,
    });
    expect(result).toBe("list");
  });

  it("twoPaneAllowed=false clamps auto-detect markdown to grid via global", () => {
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "notes",
      dominantKind: "markdown",
      twoPaneAllowed: false,
    });
    expect(result).toBe("grid");
  });

  it("drive root uses empty string as folder path key", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ "": { viewMode: "two-pane" } }),
    );
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "",
      dominantKind: null,
      twoPaneAllowed: true,
    });
    expect(result).toBe("two-pane");
  });

  it("ignores corrupt JSON in folderPrefs", () => {
    localStorage.setItem(driveKey("work"), "{ broken");
    const result = resolveFolderViewMode({
      drive: "work",
      folderPath: "Q1",
      dominantKind: null,
      twoPaneAllowed: true,
    });
    expect(result).toBe("grid");
  });
});

describe("useFolderViewMode setter", () => {
  it("writes per-folder override to folderPrefs:{drive}", () => {
    const { result } = renderHook(() =>
      useFolderViewMode({
        drive: "work",
        folderPath: "Q1",
        dominantKind: null,
        twoPaneAllowed: true,
      }),
    );

    act(() => result.current.setViewMode("two-pane"));

    expect(result.current.viewMode).toBe("two-pane");
    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored).toEqual({ "Q1": { viewMode: "two-pane" } });
  });

  it("preserves entries for other folders when updating", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ "photos": { viewMode: "grid" } }),
    );
    const { result } = renderHook(() =>
      useFolderViewMode({
        drive: "work",
        folderPath: "Q1",
        dominantKind: null,
        twoPaneAllowed: true,
      }),
    );

    act(() => result.current.setViewMode("list"));

    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored).toEqual({
      "photos": { viewMode: "grid" },
      "Q1": { viewMode: "list" },
    });
  });

  it("rejects two-pane setter when twoPaneAllowed=false", () => {
    const { result } = renderHook(() =>
      useFolderViewMode({
        drive: "work",
        folderPath: "Q1",
        dominantKind: null,
        twoPaneAllowed: false,
      }),
    );

    act(() => result.current.setViewMode("two-pane"));

    expect(result.current.viewMode).toBe("grid");
    expect(localStorage.getItem(driveKey("work"))).toBeNull();
  });

  it("re-resolves when folderPath changes", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({
        "Q1": { viewMode: "two-pane" },
        "photos": { viewMode: "grid" },
      }),
    );

    const { result, rerender } = renderHook(
      ({ folderPath }: { folderPath: string }) =>
        useFolderViewMode({
          drive: "work",
          folderPath,
          dominantKind: null,
          twoPaneAllowed: true,
        }),
      { initialProps: { folderPath: "Q1" } },
    );

    expect(result.current.viewMode).toBe("two-pane");

    rerender({ folderPath: "photos" });
    expect(result.current.viewMode).toBe("grid");
  });
});
