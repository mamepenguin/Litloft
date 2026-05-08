import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";

import { useTreeEnabled } from "../useTreeEnabled";

const driveKey = (drive: string) => `tree:enabled:${drive}`;

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
});

afterEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
});

describe("useTreeEnabled", () => {
  it("defaults to false when localStorage has no entry", () => {
    const { result } = renderHook(() => useTreeEnabled("work"));
    expect(result.current.enabled).toBe(false);
  });

  it("reads true from localStorage", () => {
    localStorage.setItem(driveKey("work"), "true");
    const { result } = renderHook(() => useTreeEnabled("work"));
    expect(result.current.enabled).toBe(true);
  });

  it("setEnabled persists to localStorage and updates state", () => {
    const { result } = renderHook(() => useTreeEnabled("work"));
    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem(driveKey("work"))).toBe("true");
  });

  it("setEnabled(false) clears the value", () => {
    localStorage.setItem(driveKey("work"), "true");
    const { result } = renderHook(() => useTreeEnabled("work"));
    expect(result.current.enabled).toBe(true);
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem(driveKey("work"))).toBe("false");
  });

  it("different drives have independent state", () => {
    localStorage.setItem(driveKey("work"), "true");
    const work = renderHook(() => useTreeEnabled("work"));
    const photos = renderHook(() => useTreeEnabled("photos"));
    expect(work.result.current.enabled).toBe(true);
    expect(photos.result.current.enabled).toBe(false);
  });

  it("two hook instances of the same drive share state via module store", () => {
    const a = renderHook(() => useTreeEnabled("work"));
    const b = renderHook(() => useTreeEnabled("work"));
    expect(a.result.current.enabled).toBe(false);
    expect(b.result.current.enabled).toBe(false);

    act(() => a.result.current.setEnabled(true));

    expect(a.result.current.enabled).toBe(true);
    expect(b.result.current.enabled).toBe(true);
  });

  it("re-reads localStorage when drive changes", () => {
    localStorage.setItem(driveKey("photos"), "true");

    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) => useTreeEnabled(drive),
      { initialProps: { drive: "work" } },
    );
    expect(result.current.enabled).toBe(false);

    rerender({ drive: "photos" });
    expect(result.current.enabled).toBe(true);
  });

  it("ignores corrupt localStorage values", () => {
    localStorage.setItem(driveKey("work"), "garbage");
    const { result } = renderHook(() => useTreeEnabled("work"));
    expect(result.current.enabled).toBe(false);
  });

  it("survives unmount/remount (page boundary crossing)", () => {
    const { result, unmount } = renderHook(() => useTreeEnabled("work"));
    act(() => result.current.setEnabled(true));
    unmount();

    const { result: result2 } = renderHook(() => useTreeEnabled("work"));
    expect(result2.current.enabled).toBe(true);
  });
});
