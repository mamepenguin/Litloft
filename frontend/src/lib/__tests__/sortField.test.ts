import { describe, it, expect } from "vitest";

import { isSortField, normalizeSortParam } from "@/lib/sortField";

describe("the listing-only updated_at sort", () => {
  it("is not a sort a folder can keep", () => {
    expect(isSortField("updated_at")).toBe(false);
  });

  it("is dropped from a URL rather than forwarded", () => {
    expect(normalizeSortParam("updated_at")).toBeUndefined();
    expect(normalizeSortParam("title")).toBe("title");
  });
});
