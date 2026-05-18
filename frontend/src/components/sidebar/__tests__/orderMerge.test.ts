import { describe, it, expect } from "vitest";

import { mergeOrder, reorder } from "../orderMerge";

describe("mergeOrder (layered fallback)", () => {
  it("returns default order when nothing is saved", () => {
    expect(mergeOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("respects saved order for IDs that still exist", () => {
    expect(mergeOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("drops saved IDs that no longer exist", () => {
    expect(mergeOrder(["c", "x", "a"], ["a", "c"])).toEqual(["c", "a"]);
  });

  it("inserts a new ID at its default position (after its default predecessor)", () => {
    // saved=[c,a], b is new; b's default predecessor is a → c,a,b
    expect(mergeOrder(["c", "a"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("inserts a new leading ID at the front when no predecessor is placed", () => {
    // saved=[b], a is new with no preceding placed neighbour → front
    expect(mergeOrder(["b"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("places multiple new IDs each at their default position", () => {
    expect(mergeOrder(["d"], ["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("always returns a permutation of currentIds", () => {
    const out = mergeOrder(["z", "b"], ["a", "b", "c"]);
    expect([...out].sort()).toEqual(["a", "b", "c"]);
  });

  it("handles empty current IDs", () => {
    expect(mergeOrder(["a", "b"], [])).toEqual([]);
  });
});

describe("reorder (immutable move)", () => {
  it("moves an item before the target", () => {
    expect(reorder(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
  });

  it("moves an item after the target", () => {
    expect(reorder(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"]);
  });

  it("moves an item before a later target", () => {
    expect(reorder(["a", "b", "c", "d"], "a", "c", "before")).toEqual(["b", "a", "c", "d"]);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    const out = reorder(input, "a", "c", "after");
    expect(input).toEqual(["a", "b", "c"]);
    expect(out).not.toBe(input);
  });

  it("returns a copy unchanged for a no-op (same id)", () => {
    expect(reorder(["a", "b"], "a", "a", "before")).toEqual(["a", "b"]);
  });

  it("returns a copy unchanged for unknown ids", () => {
    expect(reorder(["a", "b"], "x", "a", "before")).toEqual(["a", "b"]);
    expect(reorder(["a", "b"], "a", "x", "after")).toEqual(["a", "b"]);
  });
});
