import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSidebarSectionCollapsed } from "../useSidebarSectionCollapsed";

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

describe("useSidebarSectionCollapsed", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("defaults to expanded (not collapsed)", () => {
    const { result } = renderHook(() => useSidebarSectionCollapsed("tags"));
    expect(result.current.collapsed).toBe(false);
  });

  it("restores collapsed state from localStorage", () => {
    mockStorage.setItem("sidebar:section:tags:collapsed", "1");
    const { result } = renderHook(() => useSidebarSectionCollapsed("tags"));
    expect(result.current.collapsed).toBe(true);
  });

  it("toggle flips state and persists to localStorage", () => {
    const { result } = renderHook(() => useSidebarSectionCollapsed("tags"));
    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(true);
    expect(mockStorage.getItem("sidebar:section:tags:collapsed")).toBe("1");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(false);
    expect(mockStorage.getItem("sidebar:section:tags:collapsed")).toBeNull();
  });

  it("expand is a no-op when already expanded", () => {
    const { result } = renderHook(() => useSidebarSectionCollapsed("tags"));
    act(() => {
      result.current.expand();
    });
    expect(result.current.collapsed).toBe(false);
    expect(mockStorage.getItem("sidebar:section:tags:collapsed")).toBeNull();
  });

  it("expand clears persisted collapsed state", () => {
    mockStorage.setItem("sidebar:section:playlists:collapsed", "1");
    const { result } = renderHook(() => useSidebarSectionCollapsed("playlists"));
    expect(result.current.collapsed).toBe(true);
    act(() => {
      result.current.expand();
    });
    expect(result.current.collapsed).toBe(false);
    expect(mockStorage.getItem("sidebar:section:playlists:collapsed")).toBeNull();
  });

  it("uses independent keys per section", () => {
    mockStorage.setItem("sidebar:section:tags:collapsed", "1");
    const { result: tagsResult } = renderHook(() => useSidebarSectionCollapsed("tags"));
    const { result: pinsResult } = renderHook(() => useSidebarSectionCollapsed("pins"));
    expect(tagsResult.current.collapsed).toBe(true);
    expect(pinsResult.current.collapsed).toBe(false);
  });
});
