import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FolderKind } from "@/types";

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

describe("session sticky (B1: 2pane mode persists across folder navigation)", () => {
  it("two-pane selection persists when navigating to a folder where auto-detect would prefer grid", () => {
    const { result, rerender } = renderHook(
      ({
        folderPath,
        dominantKind,
      }: {
        folderPath: string;
        dominantKind: FolderKind | null;
      }) =>
        useFolderViewMode({
          drive: "work",
          folderPath,
          dominantKind,
          twoPaneAllowed: true,
        }),
      { initialProps: { folderPath: "Q1", dominantKind: null as FolderKind | null } },
    );

    act(() => result.current.setViewMode("two-pane"));
    expect(result.current.viewMode).toBe("two-pane");

    rerender({ folderPath: "videos", dominantKind: "video" });
    expect(result.current.viewMode).toBe("two-pane");

    rerender({ folderPath: "photos", dominantKind: "image" });
    expect(result.current.viewMode).toBe("two-pane");
  });

  it("two-pane sticky overrides another folder's per-folder list override", () => {
    localStorage.setItem(
      driveKey("work"),
      JSON.stringify({ photos: { viewMode: "list" } }),
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

    act(() => result.current.setViewMode("two-pane"));
    rerender({ folderPath: "photos" });
    expect(result.current.viewMode).toBe("two-pane");
  });

  it("selecting list clears session sticky and lets auto-detect take over again", () => {
    const { result, rerender } = renderHook(
      ({
        folderPath,
        dominantKind,
      }: {
        folderPath: string;
        dominantKind: FolderKind | null;
      }) =>
        useFolderViewMode({
          drive: "work",
          folderPath,
          dominantKind,
          twoPaneAllowed: true,
        }),
      {
        initialProps: {
          folderPath: "Q1",
          dominantKind: null as FolderKind | null,
        },
      },
    );

    act(() => result.current.setViewMode("two-pane"));
    expect(result.current.viewMode).toBe("two-pane");

    act(() => result.current.setViewMode("list"));
    expect(result.current.viewMode).toBe("list");

    rerender({ folderPath: "videos", dominantKind: "video" });
    expect(result.current.viewMode).toBe("grid");
  });

  it("selecting grid clears session sticky", () => {
    const { result, rerender } = renderHook(
      ({
        folderPath,
        dominantKind,
      }: {
        folderPath: string;
        dominantKind: FolderKind | null;
      }) =>
        useFolderViewMode({
          drive: "work",
          folderPath,
          dominantKind,
          twoPaneAllowed: true,
        }),
      {
        initialProps: {
          folderPath: "Q1",
          dominantKind: null as FolderKind | null,
        },
      },
    );

    act(() => result.current.setViewMode("two-pane"));
    act(() => result.current.setViewMode("grid"));

    rerender({ folderPath: "notes", dominantKind: "markdown" });
    expect(result.current.viewMode).toBe("two-pane");
  });

  it("changing drive clears session sticky", () => {
    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) =>
        useFolderViewMode({
          drive,
          folderPath: "Q1",
          dominantKind: null,
          twoPaneAllowed: true,
        }),
      { initialProps: { drive: "work" } },
    );

    act(() => result.current.setViewMode("two-pane"));
    expect(result.current.viewMode).toBe("two-pane");

    rerender({ drive: "photos" });
    expect(result.current.viewMode).toBe("grid");
  });

  it("twoPaneAllowed=false clamps session sticky to next layer", () => {
    const { result, rerender } = renderHook(
      ({ twoPaneAllowed }: { twoPaneAllowed: boolean }) =>
        useFolderViewMode({
          drive: "work",
          folderPath: "Q1",
          dominantKind: null,
          twoPaneAllowed,
        }),
      { initialProps: { twoPaneAllowed: true } },
    );

    act(() => result.current.setViewMode("two-pane"));
    expect(result.current.viewMode).toBe("two-pane");

    rerender({ twoPaneAllowed: false });
    expect(result.current.viewMode).toBe("grid");
  });

  it("two-pane selection still writes per-folder override for next session", () => {
    const { result } = renderHook(() =>
      useFolderViewMode({
        drive: "work",
        folderPath: "Q1",
        dominantKind: null,
        twoPaneAllowed: true,
      }),
    );

    act(() => result.current.setViewMode("two-pane"));

    const stored = JSON.parse(localStorage.getItem(driveKey("work"))!);
    expect(stored).toEqual({ Q1: { viewMode: "two-pane" } });
  });
});
