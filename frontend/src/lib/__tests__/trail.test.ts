import { describe, expect, it } from "vitest";

import { foldTrail } from "@/lib/trail";

const items = (n: number) => Array.from({ length: n }, (_, i) => `i${i}`);

describe("foldTrail", () => {
  it("puts every item back, folded or not", () => {
    for (let n = 0; n <= 9; n++) {
      for (const tailKept of [1, 2]) {
        const { before, folded, after } = foldTrail(items(n), tailKept);
        expect([...before, ...folded, ...after]).toEqual(items(n));
      }
    }
  });

  it("draws the trail whole until two items would be folded", () => {
    // tailKept 2 keeps the leaf and its parent, so the first foldable trail
    // is lead + 2 + 2.
    expect(foldTrail(items(4), 2).folded).toEqual([]);
    expect(foldTrail(items(5), 2).folded).toEqual(["i1", "i2"]);

    expect(foldTrail(items(3), 1).folded).toEqual([]);
    expect(foldTrail(items(4), 1).folded).toEqual(["i1", "i2"]);
  });

  it("keeps the first item and the tail, whatever the depth", () => {
    const { before, folded, after } = foldTrail(items(9), 2);
    expect(before).toEqual(["i0"]);
    expect(folded).toEqual(["i1", "i2", "i3", "i4", "i5", "i6"]);
    expect(after).toEqual(["i7", "i8"]);
  });

  it("keeps one fewer where the caller draws its own leaf", () => {
    expect(foldTrail(items(9), 1).after).toEqual(["i8"]);
  });

  it("folds nothing when the tail to keep is longer than the trail", () => {
    // Without the clamp this end index goes negative, which counts from the
    // far end and folds items out of the middle of a trail too short to fold.
    expect(foldTrail(items(6), 9).folded).toEqual([]);
    expect(foldTrail(items(4), 5).folded).toEqual([]);
  });

  it("folds nothing out of a trail shorter than the tail it must keep", () => {
    for (const n of [0, 1, 2]) {
      const { before, folded, after } = foldTrail(items(n), 2);
      expect(folded).toEqual([]);
      expect(after).toEqual([]);
      expect(before).toEqual(items(n));
    }
  });
});
