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
 * Library keeps the folder tree and its toggle, because Library is the
 * hierarchy seen from its root rather than a view that cuts across it.
 *
 * The two lists below are written out rather than read from the module:
 * reading the same table the code reads is not an independent check of it.
 */
describe("the Library root view", () => {
  const CROSS_FOLDER = ["all", "favorites", "recent", "recent-added", "liked"];
  const STANDALONE = ["trash", "missing"];

  it("measures the whole canonical set", () => {
    expect(CROSS_FOLDER).toHaveLength(5);
    expect(STANDALONE).toHaveLength(2);
  });

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

  // The `false` above is the insensitive direction of that flag: a
  // `routeHidesTree` whose standalone branch never fires satisfies it.
  // This is the other direction, so the two together say the flag works
  // *and* that Library is not one of the views it covers.
  it.each(STANDALONE)("still takes the tree away from %s under that flag", (view) => {
    expect(
      routeHidesTree({ pathname: "/drive/main", view, includeStandalone: true }),
    ).toBe(true);
  });

  it("names the Library root", () => {
    expect(isLibraryRootView(LIBRARY_VIEW)).toBe(true);
  });

  /**
   * An unrecognised `?view=` value falls through to the drive-wide listing
   * and must not be read as Library. Each of these is admitted by exactly
   * one of `toLowerCase()`, `trim()`, `startsWith` or `includes`.
   */
  it.each(["Library", "LIBRARY", "library ", " library", "my-library", "library/", "librar"])(
    "does not read %o as the Library root",
    (view) => {
      expect(isLibraryRootView(view)).toBe(false);
    },
  );

  it.each([...CROSS_FOLDER, ...STANDALONE, "not-a-view", "", null, undefined])(
    "does not read the known-or-empty value %o as the Library root",
    (view) => {
      expect(isLibraryRootView(view)).toBe(false);
    },
  );
});
