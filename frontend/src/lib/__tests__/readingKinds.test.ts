/** SPEC-CORE-059 and 060: the reading app's registry entry and the epub kind on the frontend. */

import { describe, it, expect } from "vitest";

import { builtinApps } from "../builtinApps";
import { FILE_KINDS, kindHolds, parseSearchQuery } from "../searchQuery";

describe("SPEC-CORE-059 built-in app registry: reading", () => {
  it("SPEC-CORE-059 I13 lists reading directly after video with its routes", () => {
    const ids = builtinApps.map((a) => a.id);
    const reading = builtinApps.find((a) => a.id === "reading");

    expect(reading).toBeDefined();
    expect(ids.indexOf("reading")).toBe(ids.indexOf("video") + 1);
    expect(reading!.route("main")).toBe("/drive/main/apps/reading");
    expect(reading!.route("my drive/ü")).toBe(`/drive/${encodeURIComponent("my drive/ü")}/apps/reading`);
  });

  it("SPEC-CORE-059 I13 gives reading its own label key", () => {
    const reading = builtinApps.find((a) => a.id === "reading")!;
    const video = builtinApps.find((a) => a.id === "video")!;

    expect(reading.labelKey.length).toBeGreaterThan(0);
    expect(reading.labelKey).not.toBe(video.labelKey);
  });
});

describe("SPEC-CORE-060 epub kind on the frontend", () => {
  it("SPEC-CORE-060 I12 document holds pdf and epub", () => {
    expect(kindHolds("document", "epub" as never)).toBe(true);
  });

  it("SPEC-CORE-060 I24 type:epub parses as a kind operator", () => {
    expect(parseSearchQuery("type:epub")).toMatchObject({ kinds: ["epub"], hasOperators: true });
  });

  it("SPEC-CORE-060 I24 epub is a known kind", () => {
    expect(FILE_KINDS).toContain("epub");
  });
});
