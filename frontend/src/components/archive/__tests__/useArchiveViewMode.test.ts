import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import { useArchiveViewMode } from "../useArchiveViewMode";

const STORAGE_KEY = "archive-view-choices";

describe("useArchiveViewMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the derived mode when this archive has no stored choice", () => {
    const { result } = renderHook(() => useArchiveViewMode("zip-1", "list"));

    expect(result.current.viewMode).toBe("list");
  });

  it("follows the derivation as the caller recomputes it", () => {
    const { result, rerender } = renderHook(
      ({ derived }: { derived: "grid" | "list" }) =>
        useArchiveViewMode("zip-1", derived),
      { initialProps: { derived: "list" as "grid" | "list" } }
    );

    rerender({ derived: "grid" });
    expect(result.current.viewMode).toBe("grid");
  });

  it("stops deriving once the reader has chosen", () => {
    const { result, rerender } = renderHook(
      ({ derived }: { derived: "grid" | "list" }) =>
        useArchiveViewMode("zip-1", derived),
      { initialProps: { derived: "grid" as "grid" | "list" } }
    );

    act(() => result.current.setViewMode("list"));
    // A new level of the same archive would derive `grid`. It does not win:
    // the reader has seen that answer and said otherwise.
    rerender({ derived: "grid" });
    expect(result.current.viewMode).toBe("list");
  });

  it("remembers the choice per archive, and derives for the others", () => {
    const { result } = renderHook(() => useArchiveViewMode("zip-1", "grid"));
    act(() => result.current.setViewMode("list"));

    const same = renderHook(() => useArchiveViewMode("zip-1", "grid"));
    expect(same.result.current.viewMode).toBe("list");

    const other = renderHook(() => useArchiveViewMode("zip-2", "grid"));
    expect(other.result.current.viewMode).toBe("grid");
  });

  it("starts the derivation over when a mounted viewer opens another archive", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useArchiveViewMode(id, "grid"),
      { initialProps: { id: "zip-1" } }
    );

    act(() => result.current.setViewMode("list"));
    rerender({ id: "zip-2" });
    expect(result.current.viewMode).toBe("grid");

    rerender({ id: "zip-1" });
    expect(result.current.viewMode).toBe("list");
  });

  it("ignores the superseded global key", () => {
    // `archive-view-mode` held one answer for every archive. Honouring it
    // would hand that reader a grid of folder icons forever, which is the
    // face ARC-3 exists to stop.
    window.localStorage.setItem("archive-view-mode", "grid");

    const { result } = renderHook(() => useArchiveViewMode("zip-1", "list"));
    expect(result.current.viewMode).toBe("list");
  });

  it("derives when the stored value is not a list of choices", () => {
    window.localStorage.setItem(STORAGE_KEY, "garbage");
    expect(
      renderHook(() => useArchiveViewMode("zip-1", "list")).result.current.viewMode
    ).toBe("list");

    window.localStorage.setItem(STORAGE_KEY, '[{"id":"zip-1","mode":"sideways"}]');
    expect(
      renderHook(() => useArchiveViewMode("zip-1", "list")).result.current.viewMode
    ).toBe("list");
  });

  it("keeps at most fifty archives, most recent first", () => {
    for (let i = 0; i < 55; i++) {
      const { result } = renderHook(() => useArchiveViewMode(`zip-${i}`, "grid"));
      act(() => result.current.setViewMode("list"));
    }

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.length).toBe(50);
    expect(stored[0].id).toBe("zip-54");
    expect(stored.some((c: { id: string }) => c.id === "zip-0")).toBe(false);
  });
});
