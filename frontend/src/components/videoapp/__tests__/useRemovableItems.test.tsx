import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ShelfItem } from "@/lib/api";
import { useRemovableItems } from "../useRemovableItems";

const item = (id: string) => ({ id }) as unknown as ShelfItem;
const ids = (items: readonly ShelfItem[]) => items.map((entry) => entry.id);
const SUPPLIED = [item("a"), item("b"), item("c")];

describe("SPEC-CORE-150 rule 5: Discover's removals belong to the visit, not to the mounted shelf", () => {
  it("a removal made under a visit key survives the shelf unmounting and mounting again", () => {
    const first = renderHook(() => useRemovableItems(SUPPLIED, "visit-tab-switch"));
    act(() => first.result.current.remove("b"));
    expect(ids(first.result.current.items)).toEqual(["a", "c"]);
    first.unmount();

    const second = renderHook(() => useRemovableItems(SUPPLIED, "visit-tab-switch"));
    expect(ids(second.result.current.items)).toEqual(["a", "c"]);

    act(() => second.result.current.restore("b"));
    expect(ids(second.result.current.items)).toEqual(["a", "b", "c"]);
  });

  it("another visit key does not see the removal", () => {
    const first = renderHook(() => useRemovableItems(SUPPLIED, "visit-one"));
    act(() => first.result.current.remove("a"));
    first.unmount();

    const other = renderHook(() => useRemovableItems(SUPPLIED, "visit-two"));
    expect(ids(other.result.current.items)).toEqual(["a", "b", "c"]);
  });

  it("without a key the removal lives only as long as the mounted list", () => {
    const first = renderHook(() => useRemovableItems(SUPPLIED));
    act(() => first.result.current.remove("a"));
    first.unmount();

    const second = renderHook(() => useRemovableItems(SUPPLIED));
    expect(ids(second.result.current.items)).toEqual(["a", "b", "c"]);
  });
});
