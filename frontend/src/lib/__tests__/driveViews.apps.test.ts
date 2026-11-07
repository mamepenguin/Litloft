/** SPEC-CORE-054: `apps` is a fixed segment under /drive/{name}/. */

import { describe, it, expect } from "vitest";

import { isDriveAppPath } from "../driveViews";

describe("SPEC-CORE-054 isDriveAppPath", () => {
  it.each([
    "/drive/x/apps",
    "/drive/x/apps/",
    "/drive/x/apps/video",
    "/drive/x/apps/video/shelf",
  ])("SPEC-CORE-054 is true for %s", (path) => {
    expect(isDriveAppPath(path)).toBe(true);
  });

  it.each([
    "/drive/x",
    "/drive/x/apps2",
    "/drive/x/appsy/video",
    "/drive/x/folder/apps",
    "/drive/x/addons/apps",
    "/drive/x/search",
    "/apps/video",
    "/drive/x/collections/apps",
  ])("SPEC-CORE-054 is false for %s", (path) => {
    expect(isDriveAppPath(path)).toBe(false);
  });
});
