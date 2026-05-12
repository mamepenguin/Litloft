import { describe, it, expect } from "vitest";

import {
  isDriveAddonPath,
  isDriveCollectionPath,
  isDriveSearchPath,
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
