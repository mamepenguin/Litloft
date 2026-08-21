import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTreeExpansion } from "../useTreeExpansion";

const driveKey = (drive: string) => `tree:expanded:${drive}`;

beforeEach(() => {
  localStorage.removeItem(driveKey("work"));
  localStorage.removeItem(driveKey("photos"));
});

afterEach(() => {
  localStorage.removeItem(driveKey("work"));
  localStorage.removeItem(driveKey("photos"));
});

describe("useTreeExpansion", () => {
  it("starts empty when nothing persisted", () => {
    const { result } = renderHook(() => useTreeExpansion("work"));
    expect(result.current.expanded.size).toBe(0);
    expect(result.current.isExpanded("Q1")).toBe(false);
  });

  it("hydrates from localStorage on mount", () => {
    localStorage.setItem(driveKey("work"), JSON.stringify(["Q1", "Q2"]));
    const { result } = renderHook(() => useTreeExpansion("work"));
    expect(result.current.isExpanded("Q1")).toBe(true);
    expect(result.current.isExpanded("Q2")).toBe(true);
    expect(result.current.isExpanded("Q3")).toBe(false);
  });

  it("toggle adds, then removes", () => {
    const { result } = renderHook(() => useTreeExpansion("work"));
    act(() => result.current.toggle("Q1"));
    expect(result.current.isExpanded("Q1")).toBe(true);
    expect(JSON.parse(localStorage.getItem(driveKey("work"))!)).toEqual(["Q1"]);

    act(() => result.current.toggle("Q1"));
    expect(result.current.isExpanded("Q1")).toBe(false);
    expect(JSON.parse(localStorage.getItem(driveKey("work"))!)).toEqual([]);
  });

  it("expand/collapse are idempotent", () => {
    const { result } = renderHook(() => useTreeExpansion("work"));
    act(() => result.current.expand("Q1"));
    act(() => result.current.expand("Q1"));
    expect(result.current.expanded.size).toBe(1);
    act(() => result.current.collapse("Q1"));
    act(() => result.current.collapse("Q1"));
    expect(result.current.expanded.size).toBe(0);
  });

  it("re-hydrates when drive prop changes", () => {
    localStorage.setItem(driveKey("photos"), JSON.stringify(["2024"]));
    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) => useTreeExpansion(drive),
      { initialProps: { drive: "work" } },
    );
    expect(result.current.expanded.size).toBe(0);

    rerender({ drive: "photos" });
    expect(result.current.isExpanded("2024")).toBe(true);
  });

  it("ignores corrupt JSON", () => {
    localStorage.setItem(driveKey("work"), "not json");
    const { result } = renderHook(() => useTreeExpansion("work"));
    expect(result.current.expanded.size).toBe(0);
  });

  it("ignores non-array JSON", () => {
    localStorage.setItem(driveKey("work"), JSON.stringify({ Q1: true }));
    const { result } = renderHook(() => useTreeExpansion("work"));
    expect(result.current.expanded.size).toBe(0);
  });
});

describe("useTreeExpansion.collapseMany", () => {
  it("collapses every listed path in one update", () => {
    const { result } = renderHook(() => useTreeExpansion("work"));

    act(() => {
      result.current.expand("a");
      result.current.expand("a/b");
      result.current.expand("c");
    });
    expect(result.current.expanded).toEqual(new Set(["a", "a/b", "c"]));

    act(() => {
      result.current.collapseMany(["a", "a/b"]);
    });
    expect(result.current.expanded).toEqual(new Set(["c"]));
  });

  it("leaves paths that were not expanded alone", () => {
    const { result } = renderHook(() => useTreeExpansion("work"));

    act(() => {
      result.current.expand("keep");
    });
    act(() => {
      result.current.collapseMany(["never-expanded"]);
    });

    expect(result.current.expanded).toEqual(new Set(["keep"]));
  });

  it("persists the collapse", () => {
    const { result } = renderHook(() => useTreeExpansion("work"));

    act(() => {
      result.current.expand("a");
      result.current.expand("b");
    });
    act(() => {
      result.current.collapseMany(["a"]);
    });

    expect(JSON.parse(localStorage.getItem(driveKey("work"))!)).toEqual(["b"]);
  });

  it("writes to localStorage once regardless of how many paths collapse", () => {
    const { result } = renderHook(() => useTreeExpansion("work"));
    act(() => {
      result.current.expand("a");
      result.current.expand("b");
      result.current.expand("c");
    });

    const setItem = vi.spyOn(localStorage, "setItem");
    act(() => {
      result.current.collapseMany(["a", "b", "c"]);
    });
    const writes = setItem.mock.calls.filter(([k]) => k === driveKey("work"));
    setItem.mockRestore();

    expect(writes).toHaveLength(1);
  });

  it("is a no-op for an empty list, without touching localStorage", () => {
    // Every drag end calls this; a drag that spring-loaded nothing must
    // not cost a write.
    const { result } = renderHook(() => useTreeExpansion("work"));
    act(() => {
      result.current.expand("a");
    });

    const setItem = vi.spyOn(localStorage, "setItem");
    act(() => {
      result.current.collapseMany([]);
    });
    const writes = setItem.mock.calls.filter(([k]) => k === driveKey("work"));
    setItem.mockRestore();

    expect(result.current.expanded).toEqual(new Set(["a"]));
    expect(writes).toHaveLength(0);
  });
});
