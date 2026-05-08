import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useTreeTypeFilter } from "../useTreeTypeFilter";

const driveKey = (drive: string) => `tree:typeFilter:${drive}`;

beforeEach(() => {
  localStorage.removeItem(driveKey("work"));
  localStorage.removeItem(driveKey("photos"));
});

afterEach(() => {
  localStorage.removeItem(driveKey("work"));
  localStorage.removeItem(driveKey("photos"));
});

describe("useTreeTypeFilter", () => {
  it("starts null when nothing persisted", () => {
    const { result } = renderHook(() => useTreeTypeFilter("work"));
    expect(result.current.filter).toBeNull();
  });

  it("hydrates from localStorage", () => {
    localStorage.setItem(driveKey("work"), "markdown");
    const { result } = renderHook(() => useTreeTypeFilter("work"));
    expect(result.current.filter).toBe("markdown");
  });

  it("setFilter writes valid value", () => {
    const { result } = renderHook(() => useTreeTypeFilter("work"));
    act(() => result.current.setFilter("video"));
    expect(result.current.filter).toBe("video");
    expect(localStorage.getItem(driveKey("work"))).toBe("video");
  });

  it("setFilter(null) removes the key", () => {
    localStorage.setItem(driveKey("work"), "image");
    const { result } = renderHook(() => useTreeTypeFilter("work"));
    act(() => result.current.setFilter(null));
    expect(result.current.filter).toBeNull();
    expect(localStorage.getItem(driveKey("work"))).toBeNull();
  });

  it("ignores invalid persisted value", () => {
    localStorage.setItem(driveKey("work"), "bogus");
    const { result } = renderHook(() => useTreeTypeFilter("work"));
    expect(result.current.filter).toBeNull();
  });

  it("re-hydrates when drive prop changes", () => {
    localStorage.setItem(driveKey("photos"), "image");
    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) => useTreeTypeFilter(drive),
      { initialProps: { drive: "work" } },
    );
    expect(result.current.filter).toBeNull();

    rerender({ drive: "photos" });
    expect(result.current.filter).toBe("image");
  });
});
