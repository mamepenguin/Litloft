/**
 * Tests for useTreeTextFilter — the tree-pane text filter (no persistence).
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §3.7.
 *
 * RED phase — the hook does not exist yet.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTreeTextFilter } from "../useTreeTextFilter";

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTreeTextFilter", () => {
  it("starts with empty text", () => {
    const { result } = renderHook(() => useTreeTextFilter("work", true));
    expect(result.current.text).toBe("");
    expect(result.current.debouncedText).toBe("");
  });

  it("does not persist to localStorage", () => {
    const { result } = renderHook(() => useTreeTextFilter("work", true));
    act(() => {
      result.current.setText("hello");
    });
    // The implementation must NOT write to localStorage.
    // Iterate every key looking for the value.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      expect(localStorage.getItem(k)).not.toBe("hello");
    }
  });

  it("debounces text by 300ms (debouncedText only updates after delay)", () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { result } = renderHook(() => useTreeTextFilter("work", true));
    act(() => {
      result.current.setText("foo");
    });
    expect(result.current.text).toBe("foo");
    expect(result.current.debouncedText).toBe("");
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.debouncedText).toBe("");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.debouncedText).toBe("foo");
  });

  it("resets when drive changes", () => {
    const { result, rerender } = renderHook(
      ({ drive, enabled }: { drive: string; enabled: boolean }) =>
        useTreeTextFilter(drive, enabled),
      { initialProps: { drive: "work", enabled: true } },
    );
    act(() => {
      result.current.setText("query");
    });
    expect(result.current.text).toBe("query");

    rerender({ drive: "photos", enabled: true });
    expect(result.current.text).toBe("");
  });

  it("resets when tree is toggled off", () => {
    const { result, rerender } = renderHook(
      ({ drive, enabled }: { drive: string; enabled: boolean }) =>
        useTreeTextFilter(drive, enabled),
      { initialProps: { drive: "work", enabled: true } },
    );
    act(() => {
      result.current.setText("query");
    });
    expect(result.current.text).toBe("query");

    rerender({ drive: "work", enabled: false });
    expect(result.current.text).toBe("");
  });

  it("clear() resets text immediately", () => {
    const { result } = renderHook(() => useTreeTextFilter("work", true));
    act(() => {
      result.current.setText("query");
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.text).toBe("");
  });
});
