/** SPEC-CORE-055 and I6: a smart folder as the video app's target. */

import { describe, it, expect } from "vitest";

import type { SmartFolder } from "@/types/smartFolder";
import { resolveVideoTarget } from "../videoAppTarget";

function folder(query: string, file_type: SmartFolder["file_type"] = null): SmartFolder {
  return {
    id: "sf",
    drive: "main",
    name: "Trips",
    query,
    file_type,
    sort_by: "title",
    sort_order: "asc",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

function usable(target: ReturnType<typeof resolveVideoTarget>) {
  if (!("usable" in target) || !target.usable || !("params" in target) || target.params === null) {
    throw new Error(`not a usable target: ${JSON.stringify(target)}`);
  }
  return target.params as Record<string, unknown>;
}

const list = (value: unknown): unknown[] => (value === undefined ? [] : [value].flat());

describe("SPEC-CORE-055 the default target", () => {
  it("SPEC-CORE-055 is every video of the drive", () => {
    expect(resolveVideoTarget(null)).toEqual({ usable: true, params: { type: ["video"] } });
  });
});

describe("SPEC-CORE-055 a smart folder target carries its conditions", () => {
  it("SPEC-CORE-055 sends tags, folder, flags and comparisons as listing parameters", () => {
    const params = usable(
      resolveVideoTarget(folder("tag:Trip path:Movies is:favorite is:liked duration:<10m")),
    );

    expect(list(params.tag)).toEqual(["Trip"]);
    expect(list(params.folder)).toEqual(["Movies"]);
    expect(params.favorite).toBe(true);
    expect(params.liked).toBe(true);
    expect(list(params.duration)).toEqual(["lt:600"]);
    expect(params.type).toEqual(["video"]);
  });

  it("SPEC-CORE-055 sends free text as search", () => {
    expect(usable(resolveVideoTarget(folder("holiday"))).search).toBe("holiday");
  });

  it("SPEC-CORE-055 never carries the smart folder's own sort", () => {
    const params = usable(resolveVideoTarget(folder("tag:Trip")));

    expect(params).not.toHaveProperty("sort");
    expect(params).not.toHaveProperty("order");
  });
});

describe("SPEC-CORE-055 I6 the kind is always a subset of video", () => {
  it.each([
    ["no kind at all", folder("tag:x"), ["video"]],
    ["file_type video", folder("", "video"), ["video"]],
    ["type:video in the query", folder("type:video"), ["video"]],
    ["video among several kinds in the query", folder("type:video type:image"), ["video"]],
    ["file_type video narrowed by type:video", folder("type:video", "video"), ["video"]],
  ])("SPEC-CORE-055 %s gives type [video]", (_name, sf, type) => {
    expect(usable(resolveVideoTarget(sf)).type).toEqual(type);
  });

  it.each([
    ["file_type image", folder("", "image")],
    ["type:image in the query", folder("type:image")],
    ["file_type video with type:image", folder("type:image", "video")],
    ["type:audio type:document", folder("type:audio type:document")],
  ])("SPEC-CORE-055 %s is selectable but empty, so no request is made", (_name, sf) => {
    expect(resolveVideoTarget(sf)).toEqual({ usable: true, empty: true, params: null });
  });
});
