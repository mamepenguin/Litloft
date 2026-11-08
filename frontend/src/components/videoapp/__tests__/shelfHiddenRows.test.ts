import { describe, expect, it } from "vitest";

import { hiddenRowIndices } from "../shelfHiddenRows";

describe("hiddenRowIndices", () => {
  it("marks nothing when every card top is above the second row's bottom", () => {
    expect(hiddenRowIndices([4, 4, 4, 4, 4], 384)).toEqual([]);
  });

  it("marks a card whose top is exactly the second row's bottom", () => {
    expect(hiddenRowIndices([4, 4, 4, 4, 384], 384)).toEqual([4]);
  });

  it("marks every card from the third row on, in item order", () => {
    expect(
      hiddenRowIndices([4, 4, 4, 200, 200, 200, 396, 396, 396], 384),
    ).toEqual([6, 7, 8]);
  });

  it("marks nothing when there are no cards", () => {
    expect(hiddenRowIndices([], 384)).toEqual([]);
  });
});
