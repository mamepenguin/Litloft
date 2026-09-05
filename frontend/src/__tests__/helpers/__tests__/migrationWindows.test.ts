import { describe, it, expect } from "vitest";
import {
  MIGRATION_WINDOWS,
  openWindows,
  windowSide,
} from "../migrationWindows";

/**
 * The window mechanism itself.
 *
 * It exists to widen a detector by exactly the distance a migration crosses,
 * and the risk it carries is that it widens further than that. So what is
 * asserted here is the narrowness: two values pass, everything else fails,
 * and each entry names the pull request that deletes it.
 */
describe("migration windows", () => {
  const PATH = "addons/media_import/frontend/Composer.tsx";

  it("admits both declared endpoints and says which", () => {
    expect(windowSide(1, PATH)).toBe("before");
    expect(windowSide(0, PATH)).toBe("after");
  });

  it("admits nothing else", () => {
    for (const n of [2, 3, -1, 99]) {
      expect(() => windowSide(n, PATH)).toThrow(/expected 1 .*or 0/);
    }
  });

  it("refuses a path nobody declared", () => {
    expect(() => windowSide(0, "addons/media_import/frontend/api.ts")).toThrow(
      /no migration window/,
    );
  });

  it("names the pull request that removes each entry", () => {
    // Not "migrating": a relaxation with no one assigned to remove it is a
    // permanently loose detector, which is the same as never having had a
    // strict one. D1's acceptance conditions include deleting these.
    for (const [path, w] of Object.entries(MIGRATION_WINDOWS)) {
      expect(w.closedBy, path).toMatch(/^[A-Z]\d/);
      expect(w.why.length, path).toBeGreaterThan(0);
    }
  });

  it("keeps each window to the ledger that counts it", () => {
    // One path can appear in two ledgers. Without the `ledger` field the
    // heading window was read by the button detector and took a site off a
    // total it had never been in.
    expect(openWindows("button-adoption", () => true)).toEqual([
      "addons/media_import/frontend/Composer.tsx",
    ]);
    expect(openWindows("page-headings", () => true)).toEqual([
      "addons/media_import/frontend/Page.tsx",
    ]);
  });

  it("treats an addon that is not checked out as absent", () => {
    expect(openWindows("button-adoption", () => false)).toEqual([]);
  });
});
