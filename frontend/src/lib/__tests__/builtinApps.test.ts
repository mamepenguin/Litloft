/** SPEC-CORE-054 I11: the core registry of built-in apps. */

import { describe, it, expect } from "vitest";

import { builtinApps } from "../builtinApps";

describe("SPEC-CORE-054 built-in app registry", () => {
  it("SPEC-CORE-054 lists the video app with its route under the drive", () => {
    const video = builtinApps.find((app) => app.id === "video");

    expect(video).toBeDefined();
    expect(video!.route("main")).toBe("/drive/main/apps/video");
  });

  it("SPEC-CORE-054 encodes the drive name in the route", () => {
    const video = builtinApps.find((app) => app.id === "video")!;

    expect(video.route("my drive/ü")).toBe(
      `/drive/${encodeURIComponent("my drive/ü")}/apps/video`,
    );
  });

  it("SPEC-CORE-054 I11 names no addon", () => {
    const text = JSON.stringify(builtinApps.map((a) => [a.id, a.labelKey, a.route("d")])).toLowerCase();

    for (const addon of ["knowledge", "intelligence", "notes", "ask", "media_import"]) {
      expect(text, addon).not.toContain(addon);
    }
  });

  it("SPEC-CORE-054 gives every app a distinct id and a label key", () => {
    const ids = builtinApps.map((a) => a.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(builtinApps.every((a) => a.labelKey.length > 0)).toBe(true);
  });
});
