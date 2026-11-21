import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePaged, type Page } from "../usePaged";

type Item = { id: string };

describe("SPEC-CORE-157 I4 usePaged", () => {
  it("SPEC-CORE-157 I4 a page that adds no new item ends the list, so the next page is not asked again", async () => {
    const first: Page<Item> = { items: [{ id: "a" }, { id: "b" }], total: 10 };
    const fetchPage = vi.fn(async (_page: number): Promise<Page<Item>> => first);
    const { result } = renderHook(() => usePaged<Item>(fetchPage));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.more).toBe("idle"));

    expect(result.current.hasMore).toBe(false);
    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
    const asked = fetchPage.mock.calls.length;
    act(() => result.current.loadMore());
    expect(fetchPage.mock.calls.length).toBe(asked);
  });
});
