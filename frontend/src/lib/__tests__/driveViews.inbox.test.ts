/**
 * SPEC-CORE-032 I15 — the inbox cuts across the folder hierarchy, so the
 * tree must not claim an arrival lives at the path it was uploaded to.
 */

import { describe, it, expect } from "vitest";

import {
  isCrossFolderView,
  isStandaloneView,
  normaliseDriveView,
  routeHidesTree,
} from "../driveViews";

describe("SPEC-CORE-032 I15 the inbox is a standalone view", () => {
  it("SPEC-CORE-032 I15 classifies inbox as standalone and not cross-folder", () => {
    expect(isStandaloneView("inbox")).toBe(true);
    expect(isCrossFolderView("inbox")).toBe(false);
  });

  it("SPEC-CORE-032 I15 takes the folder tree away on ?view=inbox", () => {
    expect(
      routeHidesTree({
        pathname: "/drive/main",
        view: "inbox",
        includeStandalone: true,
      }),
    ).toBe(true);
  });

  it("SPEC-CORE-032 I15 leaves the inbox's spelling in the URL alone", () => {
    expect(normaliseDriveView("inbox")).toBe("inbox");
  });

  /**
   * The two views that already owned the standalone answer. The inbox is
   * added beside them, not in place of them.
   */
  it.each(["trash", "missing"])(
    "SPEC-CORE-032 I15 keeps %s standalone",
    (view) => {
      expect(isStandaloneView(view)).toBe(true);
      expect(
        routeHidesTree({
          pathname: "/drive/main",
          view,
          includeStandalone: true,
        }),
      ).toBe(true);
    },
  );

  it("SPEC-CORE-032 I15 does not give the inbox a folder of its own", () => {
    expect(
      routeHidesTree({ pathname: "/drive/main", view: "inbox" }),
    ).toBe(false);
  });
});
