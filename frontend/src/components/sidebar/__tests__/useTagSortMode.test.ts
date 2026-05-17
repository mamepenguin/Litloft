import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useTagSortMode, sortTags } from "../useTagSortMode";
import type { Tag } from "@/types";

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

const TAGS: Tag[] = [
  { name: "banana", count: 2 },
  { name: "apple", count: 5 },
  { name: "cherry", count: 5 },
];

describe("sortTags", () => {
  it("sorts by count desc with name tiebreaker", () => {
    expect(sortTags(TAGS, "count").map((t) => t.name)).toEqual([
      "apple",
      "cherry",
      "banana",
    ]);
  });

  it("sorts by name asc", () => {
    expect(sortTags(TAGS, "name").map((t) => t.name)).toEqual([
      "apple",
      "banana",
      "cherry",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [...TAGS];
    sortTags(input, "name");
    expect(input).toEqual(TAGS);
  });
});

describe("useTagSortMode", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("defaults to count", () => {
    const { result } = renderHook(() => useTagSortMode("work"));
    expect(result.current.mode).toBe("count");
  });

  it("restores a saved mode", () => {
    mockStorage.setItem("sidebar:sort:tags:work", "name");
    const { result } = renderHook(() => useTagSortMode("work"));
    expect(result.current.mode).toBe("name");
  });

  it("persists a non-default mode", () => {
    const { result } = renderHook(() => useTagSortMode("work"));
    act(() => {
      result.current.setMode("name");
    });
    expect(result.current.mode).toBe("name");
    expect(mockStorage.getItem("sidebar:sort:tags:work")).toBe("name");
  });

  it("removes the key when set back to the default", () => {
    mockStorage.setItem("sidebar:sort:tags:work", "name");
    const { result } = renderHook(() => useTagSortMode("work"));
    act(() => {
      result.current.setMode("count");
    });
    expect(mockStorage.getItem("sidebar:sort:tags:work")).toBeNull();
  });

  it("is per-drive", () => {
    mockStorage.setItem("sidebar:sort:tags:work", "name");
    const { result } = renderHook(() => useTagSortMode("photos"));
    expect(result.current.mode).toBe("count");
  });

  it("is inert with a null drive", () => {
    const { result } = renderHook(() => useTagSortMode(null));
    expect(result.current.mode).toBe("count");
    act(() => {
      result.current.setMode("name");
    });
    expect(mockStorage.length).toBe(0);
  });
});
