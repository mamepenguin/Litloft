import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSidebarSectionOrder } from "../useSidebarSectionOrder";

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

const KEY = "sidebar:order:sections";
const AVAILABLE = ["collections", "pins", "smart-folders", "tags"];

describe("useSidebarSectionOrder", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("defaults to the available order when nothing is saved", () => {
    const { result } = renderHook(() => useSidebarSectionOrder(AVAILABLE));
    expect(result.current.order).toEqual(AVAILABLE);
  });

  it("restores a saved order from localStorage", () => {
    mockStorage.setItem(KEY, JSON.stringify(["tags", "pins", "collections", "smart-folders"]));
    const { result } = renderHook(() => useSidebarSectionOrder(AVAILABLE));
    expect(result.current.order).toEqual(["tags", "pins", "collections", "smart-folders"]);
  });

  it("setOrder persists and updates", () => {
    const { result } = renderHook(() => useSidebarSectionOrder(AVAILABLE));
    act(() => {
      result.current.setOrder(["tags", "collections", "pins", "smart-folders"]);
    });
    expect(result.current.order).toEqual(["tags", "collections", "pins", "smart-folders"]);
    expect(JSON.parse(mockStorage.getItem(KEY) as string)).toEqual([
      "tags",
      "collections",
      "pins",
      "smart-folders",
    ]);
  });

  it("merges a newly added (addon) section at its default position", () => {
    mockStorage.setItem(KEY, JSON.stringify(["tags", "pins"]));
    const withAddon = ["collections", "pins", "smart-folders", "tags", "addon-x"];
    const { result } = renderHook(() => useSidebarSectionOrder(withAddon));
    // saved kept (tags, pins); new ones at default positions
    expect([...result.current.order].sort()).toEqual([...withAddon].sort());
    expect(result.current.order.indexOf("tags")).toBeLessThan(
      result.current.order.indexOf("pins"),
    );
  });

  it("drops a section that no longer exists", () => {
    mockStorage.setItem(KEY, JSON.stringify(["tags", "ghost", "pins"]));
    const { result } = renderHook(() => useSidebarSectionOrder(["pins", "tags"]));
    expect(result.current.order).toEqual(["tags", "pins"]);
  });

  it("reset clears persisted order", () => {
    mockStorage.setItem(KEY, JSON.stringify(["tags", "pins", "collections", "smart-folders"]));
    const { result } = renderHook(() => useSidebarSectionOrder(AVAILABLE));
    act(() => {
      result.current.reset();
    });
    expect(result.current.order).toEqual(AVAILABLE);
    expect(mockStorage.getItem(KEY)).toBeNull();
  });

  it("ignores malformed persisted JSON", () => {
    mockStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useSidebarSectionOrder(AVAILABLE));
    expect(result.current.order).toEqual(AVAILABLE);
  });
});
