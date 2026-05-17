import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSidebarItemOrder } from "../useSidebarItemOrder";

function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
const mockStorage = makeLocalStorageMock();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: mockStorage,
});

afterAll(() => {
  if (originalLocalStorage) {
    Object.defineProperty(window, "localStorage", originalLocalStorage);
  }
});

describe("useSidebarItemOrder", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("defaults to the server order when nothing is saved", () => {
    const { result } = renderHook(() =>
      useSidebarItemOrder("pins", "work", ["a", "b", "c"]),
    );
    expect(result.current.order).toEqual(["a", "b", "c"]);
  });

  it("restores a saved per-drive order", () => {
    mockStorage.setItem("sidebar:order:pins:work", JSON.stringify(["c", "a", "b"]));
    const { result } = renderHook(() =>
      useSidebarItemOrder("pins", "work", ["a", "b", "c"]),
    );
    expect(result.current.order).toEqual(["c", "a", "b"]);
  });

  it("persists under a section+drive scoped key", () => {
    const { result } = renderHook(() =>
      useSidebarItemOrder("collections", "photos", ["x", "y"]),
    );
    act(() => {
      result.current.setOrder(["y", "x"]);
    });
    expect(JSON.parse(mockStorage.getItem("sidebar:order:collections:photos") as string)).toEqual([
      "y",
      "x",
    ]);
    expect(result.current.order).toEqual(["y", "x"]);
  });

  it("isolates order between drives", () => {
    mockStorage.setItem("sidebar:order:pins:work", JSON.stringify(["b", "a"]));
    const { result, rerender } = renderHook(
      ({ drive }: { drive: string }) =>
        useSidebarItemOrder("pins", drive, ["a", "b"]),
      { initialProps: { drive: "work" } },
    );
    expect(result.current.order).toEqual(["b", "a"]);
    rerender({ drive: "photos" });
    expect(result.current.order).toEqual(["a", "b"]); // photos has no saved order
  });

  it("merges a newly created item at its server position", () => {
    mockStorage.setItem("sidebar:order:pins:work", JSON.stringify(["b", "a"]));
    const { result } = renderHook(() =>
      useSidebarItemOrder("pins", "work", ["a", "b", "c"]),
    );
    expect([...result.current.order].sort()).toEqual(["a", "b", "c"]);
    expect(result.current.order.indexOf("b")).toBeLessThan(
      result.current.order.indexOf("a"),
    );
  });

  it("is inert with a null drive", () => {
    const { result } = renderHook(() =>
      useSidebarItemOrder("pins", null, ["a", "b"]),
    );
    expect(result.current.order).toEqual(["a", "b"]);
    act(() => {
      result.current.setOrder(["b", "a"]);
    });
    expect(mockStorage.length).toBe(0);
  });
});
