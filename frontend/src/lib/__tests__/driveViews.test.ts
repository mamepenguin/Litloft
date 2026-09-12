import { describe, it, expect } from "vitest";

import {
  isCrossFolderView,
  isDriveAddonPath,
  isDriveCollectionPath,
  isDriveSearchPath,
  isLibraryRootView,
  isStandaloneView,
  routeHidesTree,
  LIBRARY_VIEW,
} from "../driveViews";

describe("isDriveCollectionPath", () => {
  it("matches /drive/{name}/collections/{id}", () => {
    expect(isDriveCollectionPath("/drive/main/collections/c1")).toBe(true);
    expect(isDriveCollectionPath("/drive/work/collections/abc123")).toBe(true);
    expect(isDriveCollectionPath("/drive/my%20drive/collections/c1")).toBe(true);
  });

  it("tolerates a single trailing slash", () => {
    expect(isDriveCollectionPath("/drive/main/collections/c1/")).toBe(true);
  });

  it("does not match the collection list root or unrelated subpaths", () => {
    expect(isDriveCollectionPath("/drive/main/collections")).toBe(false);
    expect(isDriveCollectionPath("/drive/main/collections/")).toBe(false);
    expect(isDriveCollectionPath("/drive/main/collections/c1/items")).toBe(
      false,
    );
  });

  it("does not match unrelated drive routes", () => {
    expect(isDriveCollectionPath("/drive/main")).toBe(false);
    expect(isDriveCollectionPath("/drive/main/foo")).toBe(false);
    expect(isDriveCollectionPath("/drive/main/search")).toBe(false);
    expect(isDriveCollectionPath("/drive/main/addons/x")).toBe(false);
  });

  it("does not conflict with existing helpers on the same paths", () => {
    const collection = "/drive/main/collections/c1";
    expect(isDriveCollectionPath(collection)).toBe(true);
    expect(isDriveSearchPath(collection)).toBe(false);
    expect(isDriveAddonPath(collection)).toBe(false);
  });
});

/**
 * spec 2026-09-12-purpose-oriented-navigation §7.1 — Library keeps the
 * folder tree and its toggle, because Library is the hierarchy seen from
 * its root rather than a view that cuts across it.
 *
 * What this holds: `library` classifies as neither a cross-folder nor a
 * standalone view, and `routeHidesTree` therefore leaves the tree in
 * place. Putting `library` into either set — the way a later reading of
 * "it is a ?view= value like the others" would — turns these red.
 *
 * What it does not hold: an unrelated value being *added* to either set.
 * Neither set is exported, and widening the module's surface to let a
 * test read them would make the test a second reader of one table
 * rather than an independent check of it
 * (`.claude/rules/review-workflow.md`, detector rule 2).
 */
describe("the Library root view", () => {
  const CROSS_FOLDER = ["all", "favorites", "recent", "recent-added", "liked"];
  const STANDALONE = ["trash", "missing"];

  it.each(CROSS_FOLDER)("still classifies %s as cross-folder", (view) => {
    expect(isCrossFolderView(view)).toBe(true);
    expect(isStandaloneView(view)).toBe(false);
  });

  it.each(STANDALONE)("still classifies %s as standalone", (view) => {
    expect(isStandaloneView(view)).toBe(true);
    expect(isCrossFolderView(view)).toBe(false);
  });

  it("is neither a cross-folder nor a standalone view", () => {
    expect(isCrossFolderView(LIBRARY_VIEW)).toBe(false);
    expect(isStandaloneView(LIBRARY_VIEW)).toBe(false);
  });

  it("keeps the folder tree available", () => {
    expect(
      routeHidesTree({ pathname: "/drive/main", view: LIBRARY_VIEW }),
    ).toBe(false);
    expect(
      routeHidesTree({
        pathname: "/drive/main",
        view: LIBRARY_VIEW,
        includeStandalone: true,
      }),
    ).toBe(false);
  });

  it("names the root only when no folder path is carried", () => {
    expect(isLibraryRootView({ view: LIBRARY_VIEW, folderPath: "" })).toBe(true);
    expect(isLibraryRootView({ view: LIBRARY_VIEW, folderPath: undefined })).toBe(true);
    expect(isLibraryRootView({ view: LIBRARY_VIEW, folderPath: null })).toBe(true);
    expect(isLibraryRootView({ view: LIBRARY_VIEW, folderPath: "photos" })).toBe(false);
  });

  it("does not name the root for any other view, known or unknown", () => {
    for (const view of [...CROSS_FOLDER, ...STANDALONE, "not-a-view", "", null, undefined]) {
      expect(isLibraryRootView({ view, folderPath: "" })).toBe(false);
    }
  });
});
