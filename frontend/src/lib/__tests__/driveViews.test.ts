import { describe, it, expect } from "vitest";

import {
  driveHref,
  isCrossFolderView,
  isDriveAddonPath,
  isDriveCollectionPath,
  isDriveSearchPath,
  isStandaloneView,
  normaliseDriveView,
  routeHidesTree,
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
 * Home keeps the folder tree and its toggle, because it is the drive seen
 * from one place rather than a view that cuts across the hierarchy.
 *
 * The two lists below are written out rather than read from the module:
 * reading the same table the code reads is not an independent check of it.
 */
describe("the Home view", () => {
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
    expect(isCrossFolderView("home")).toBe(false);
    expect(isStandaloneView("home")).toBe(false);
  });

  it("keeps the folder tree available", () => {
    expect(routeHidesTree({ pathname: "/drive/main", view: "home" })).toBe(false);
    expect(
      routeHidesTree({
        pathname: "/drive/main",
        view: "home",
        includeStandalone: true,
      }),
    ).toBe(false);
  });

  // The `false` above is the insensitive direction of that flag: a
  // `routeHidesTree` whose standalone branch never fires satisfies it.
  // This is the other direction, so the two together say the flag works
  // *and* that Home is not one of the views it covers.
  it.each(STANDALONE)("still takes the tree away from %s under that flag", (view) => {
    expect(
      routeHidesTree({ pathname: "/drive/main", view, includeStandalone: true }),
    ).toBe(true);
  });
});

describe("normaliseDriveView", () => {
  it("rewrites the Library alias to no view at all", () => {
    expect(normaliseDriveView("library")).toBe(null);
  });

  /**
   * An unrecognised `?view=` value falls through to the drive-wide listing.
   * Rewriting one of these would silently turn it into the Library root.
   * Each is admitted by exactly one of `toLowerCase()`, `trim()`,
   * `startsWith` or `includes`.
   */
  it.each(["Library", "LIBRARY", "library ", " library", "my-library", "library/", "librar"])(
    "leaves %o alone",
    (view) => {
      expect(normaliseDriveView(view)).toBe(view);
    },
  );

  it.each(["all", "favorites", "recent", "recent-added", "liked", "trash", "missing", "home", "not-a-view", ""])(
    "leaves the known-or-empty value %o alone",
    (view) => {
      expect(normaliseDriveView(view)).toBe(view);
    },
  );

  it("passes a missing view through", () => {
    expect(normaliseDriveView(null)).toBe(null);
  });
});

describe("driveHref", () => {
  it("gives Library the bare drive URL and Home a view", () => {
    expect(driveHref("main", "library")).toBe("/drive/main");
    expect(driveHref("main", "home")).toBe("/drive/main?view=home");
  });

  it("encodes the drive name in both forms", () => {
    expect(driveHref("my drive", "library")).toBe("/drive/my%20drive");
    expect(driveHref("my drive", "home")).toBe("/drive/my%20drive?view=home");
  });

  /**
   * Read back through `URL` rather than by string comparison, so the
   * builder and the reader that decides the screen are two implementations
   * rather than one table consulted twice.
   */
  it.each([
    ["library", null],
    ["home", "home"],
  ] as const)("hands the route layer %o as the view %o", (kind, expected) => {
    const parsed = new URL(driveHref("main", kind), "http://x");
    expect(normaliseDriveView(parsed.searchParams.get("view"))).toBe(expected);
  });
});
