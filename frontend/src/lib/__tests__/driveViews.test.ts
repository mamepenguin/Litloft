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
 * The two lists below are this block's own statement of the canonical
 * set, checked against the count 裁定 3 fixes externally so that
 * shrinking one cannot silently delete cases. They are written out
 * rather than read from the module: reading the same table the code
 * reads is not an independent check of it
 * (`.claude/rules/review-workflow.md`, detector rule 2).
 *
 * What is still not held: a value nothing declares being *added* to
 * either set in the module. Nothing here can see that.
 */
describe("the Library root view", () => {
  const CROSS_FOLDER = ["all", "favorites", "recent", "recent-added", "liked"];
  const STANDALONE = ["trash", "missing"];

  // The two lists below feed every `it.each` in this block, so walking
  // either of them back silently deletes cases. The numbers are not this
  // test's own invention: 裁定 3 of the stage-1 brief fixes the canonical
  // `?view=` set at seven values, five of which cut across the folder
  // hierarchy and two of which own their own page.
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
   * The values a weakened comparison would admit.
   *
   * 裁定 3 of the stage-1 brief keeps an unrecognised `?view=` value
   * falling through to the drive-wide listing, and forbids the classifier
   * reading such a value as Library. A hand-picked list of unknowns that
   * happens to contain nothing a lenient comparison would swallow proves
   * nothing about that: each of these is admitted by exactly one of
   * `toLowerCase()`, `trim()`, `startsWith` or `includes`.
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
