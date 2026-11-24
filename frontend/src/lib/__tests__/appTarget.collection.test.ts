/** SPEC-CORE-119: the target-id and collection-target helpers of `@/lib/appTarget`. */

import { describe, expect, it } from "vitest";

import { collectionTargetId, parseAppTargetId, resolveCollectionTarget } from "../appTarget";
import { READING_BASE_KINDS } from "../readingAppTarget";
import type { CollectionSummary, FileKind } from "@/types";

function collection(id: string, name: string): CollectionSummary {
  return {
    id,
    name,
    description: null,
    drive: "main",
    item_count: 3,
    first_file_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("SPEC-CORE-119 I8 parseAppTargetId", () => {
  it("SPEC-CORE-119 I8 reads \"default\" as the default target", () => {
    expect(parseAppTargetId("default")).toEqual({ kind: "default" });
  });

  it.each(["V1StGXR8_Z5j", "abcdefghijkl"])("SPEC-CORE-119 I8 reads collection:%s as that collection", (id) => {
    expect(parseAppTargetId(`collection:${id}`)).toEqual({ kind: "collection", id });
  });

  it.each(["V1StGXR8_Z5j", "sf-1", "collection", "mycollection:x", "Collection:abc", " collection:abc"])(
    "SPEC-CORE-119 I8 reads %j as a Smart Collection id, unchanged",
    (id) => {
      expect(parseAppTargetId(id)).toEqual({ kind: "smart", id });
    },
  );
});

describe("SPEC-CORE-119 I8 collectionTargetId", () => {
  it("SPEC-CORE-119 prefixes the collection id", () => {
    expect(collectionTargetId("V1StGXR8_Z5j")).toBe("collection:V1StGXR8_Z5j");
  });

  it.each(["V1StGXR8_Z5j", "abcdefghijkl", "a-b_c"])("SPEC-CORE-119 I8 round-trips %s through parseAppTargetId", (id) => {
    expect(parseAppTargetId(collectionTargetId(id))).toEqual({ kind: "collection", id });
  });
});

describe("SPEC-CORE-119 I8 resolveCollectionTarget", () => {
  it.each([
    [["video"] as FileKind[]],
    [[...READING_BASE_KINDS] as FileKind[]],
    [["image"] as FileKind[]],
  ])("SPEC-CORE-119 sends the base kinds %j and the collection's name, nothing else", (base) => {
    expect(resolveCollectionTarget(collection("c1", "Trip 2024"), base)).toEqual({
      usable: true,
      params: { type: base, collection: ["Trip 2024"] },
    });
  });

  it("SPEC-CORE-119 does not share the caller's base-kind array", () => {
    const base: FileKind[] = ["video"];
    const target = resolveCollectionTarget(collection("c1", "Trip"), base);
    base.push("image");

    expect(target).toEqual({ usable: true, params: { type: ["video"], collection: ["Trip"] } });
  });

  it.each([[[]], [["document"]], [["image", "document"]], [["document", "pdf"]]] as const)(
    "SPEC-CORE-119 I8 throws for base kinds %j, as resolveAppTarget does",
    (base) => {
      expect(resolveCollectionTarget).toBeTypeOf("function");
      expect(() => resolveCollectionTarget(collection("c1", "Trip"), base as readonly FileKind[])).toThrow();
    },
  );
});
