import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { useArchiveViewMode } from "../useArchiveViewMode";

const STORAGE_KEY = "archive-view-mode";

describe("useArchiveViewMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'grid' when localStorage is empty", () => {
    const { result } = renderHook(() => useArchiveViewMode());

    expect(result.current.viewMode).toBe("grid");
  });

  it("initializes with 'list' when localStorage has 'list'", () => {
    window.localStorage.setItem(STORAGE_KEY, "list");

    const { result } = renderHook(() => useArchiveViewMode());

    expect(result.current.viewMode).toBe("list");
  });

  it("persists viewMode to localStorage when setViewMode is called", () => {
    const { result } = renderHook(() => useArchiveViewMode());

    act(() => {
      result.current.setViewMode("list");
    });

    expect(result.current.viewMode).toBe("list");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("list");
  });

  it("falls back to 'grid' when localStorage holds an unknown value", () => {
    window.localStorage.setItem(STORAGE_KEY, "garbage");

    const { result } = renderHook(() => useArchiveViewMode());

    expect(result.current.viewMode).toBe("grid");
  });
});
