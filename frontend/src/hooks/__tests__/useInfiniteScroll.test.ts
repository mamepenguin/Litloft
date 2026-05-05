import { renderHook, render, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { useInfiniteScroll } from "../useInfiniteScroll";

class MockIntersectionObserver {
  private cb: IntersectionObserverCallback;
  static instances: MockIntersectionObserver[] = [];

  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    MockIntersectionObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  fire(isIntersecting: boolean) {
    this.cb(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

const makeItems = (ids: string[]) => ids.map((id) => ({ id }));

describe("useInfiniteScroll", () => {
  it("loads page 1 on mount and sets hasMore correctly", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      data: makeItems(["a", "b"]),
      total: 2,
    });

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetchPage, limit: 30 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.hasMore).toBe(false);
  });

  it("sets hasMore=true when more pages exist", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({
      data: makeItems(["a", "b"]),
      total: 5,
    });

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetchPage, limit: 2 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);
  });

  it("stops loading when an empty append page is returned (reachedEnd)", async () => {
    // Simulates the search-cache hydration bug:
    // initial hydration has 8 items (popup limit) with total=30.
    // The search page then loads with limit=30. Page 2 (offset 30)
    // comes back empty because the 30-item total was exhausted by
    // items 1-30 on the server, but items 9-30 were skipped due to
    // the limit mismatch. Without the reachedEnd guard, hasMore stays
    // true forever and page loads loop infinitely.
    const fetchPage = vi.fn().mockResolvedValueOnce({
      data: [],   // page 2 is empty
      total: 30,  // server still reports full total
    });

    let capturedHook: ReturnType<typeof useInfiniteScroll<{ id: string }>> | null = null;

    function Wrapper() {
      const hook = useInfiniteScroll<{ id: string }>({
        fetchPage,
        limit: 30,
        initial: {
          items: makeItems(Array.from({ length: 8 }, (_, i) => `init-${i}`)),
          total: 30,
          page: 1,
        },
      });
      capturedHook = hook;
      return createElement("div", { ref: hook.sentinelRef });
    }

    render(createElement(Wrapper));

    // Observer is created because hasMore=true (8 < 30) and sentinel is mounted
    await waitFor(() =>
      expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0),
    );

    // Sentinel intersects → triggers loadPage(2, true)
    act(() => MockIntersectionObserver.instances[0].fire(true));

    await waitFor(() => expect(capturedHook?.loadingMore).toBe(false));

    // reachedEnd=true because page 2 returned 0 items → hasMore must be false
    expect(capturedHook?.hasMore).toBe(false);
    expect(capturedHook?.items).toHaveLength(8);
  });

  it("resets reachedEnd on reset()", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: makeItems(["a", "b"]), total: 5 })
      .mockResolvedValueOnce({ data: makeItems(["a", "b"]), total: 5 });

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetchPage, limit: 30 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);
  });
});
