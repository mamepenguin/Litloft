import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  MIGRATION_WINDOWS,
  PENDING_PRS,
  addonPresent,
  openWindows,
  windowSide,
} from "../migrationWindows";

/**
 * The window mechanism itself.
 *
 * It exists to widen a detector by exactly the distance a migration crosses,
 * and the risk it carries is that it widens further than that. So what is
 * asserted here is the narrowness: two values pass, everything else fails,
 * and each entry names a pull request that is actually still open.
 */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);
const there = { exists: true };
const gone = { exists: false };
const PATH = "addons/media_import/frontend/Composer.tsx";

describe("migration windows", () => {
  it("admits both declared endpoints and says which", () => {
    expect(windowSide(1, "button-adoption", PATH, there)).toBe("before");
    expect(windowSide(0, "button-adoption", PATH, there)).toBe("after");
  });

  it("admits nothing else", () => {
    for (const n of [2, 3, -1, 99]) {
      expect(() => windowSide(n, "button-adoption", PATH, there)).toThrow(
        /expected 1 .*or 0/,
      );
    }
  });

  it("refuses a path nobody declared", () => {
    expect(() =>
      windowSide(0, "button-adoption", "addons/media_import/frontend/api.ts", there),
    ).toThrow(/no migration window/);
  });

  it("refuses a path declared on the other ledger", () => {
    // The same file can hold a window on each ledger, so asking the wrong one
    // must not resolve. Four paths are already on both.
    expect(() =>
      windowSide(1, "page-headings", PATH, there),
    ).toThrow(/no migration window/);
  });

  it("refuses a file that has gone", () => {
    // A window spans a conversion, not a deletion, and `count ?? 0` cannot
    // tell those apart. The first version of this test asked about an
    // *undeclared* path and caught the wrong error one line above — it would
    // have passed with the guard deleted.
    expect(() => windowSide(0, "button-adoption", PATH, gone)).toThrow(
      /the file is gone/,
    );
    expect(() => windowSide(1, "button-adoption", PATH, gone)).toThrow(
      /the file is gone/,
    );
  });

  it("names a pull request that has not landed yet", () => {
    // Not a regex on the shape: `/^[A-Z]\d/` admitted "A1", which shipped
    // weeks ago, and "Z9", which was never planned. A name that passes a
    // pattern is not an assignment.
    for (const [ledger, windows] of Object.entries(MIGRATION_WINDOWS)) {
      for (const [path, w] of Object.entries(windows)) {
        expect(PENDING_PRS as readonly string[], `${ledger}:${path}`).toContain(
          w.closedBy,
        );
        expect(w.why.length, `${ledger}:${path}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps each ledger's windows to itself", () => {
    // Keyed by ledger *then* path, so one file can be mid-migration on both.
    // Keying by path alone made a second entry a duplicate key that `tsc`
    // rejects — which C2 and C3 need, and C1 happened not to.
    expect(openWindows("button-adoption", () => true)).toEqual([PATH]);
    expect(openWindows("page-headings", () => true)).toEqual([
      "addons/media_import/frontend/Page.tsx",
    ]);
  });

  it("lets one path hold a window on each ledger", () => {
    const both = Object.keys(MIGRATION_WINDOWS) as Array<
      keyof typeof MIGRATION_WINDOWS
    >;
    expect(both).toEqual(["page-headings", "button-adoption"]);
    // The shape admits it even where nothing uses it yet: a `Record` per
    // ledger cannot collide, and that is the whole reason for the nesting.
    for (const ledger of both) {
      expect(typeof MIGRATION_WINDOWS[ledger]).toBe("object");
    }
  });

  it("treats an addon that is not checked out as absent", () => {
    expect(openWindows("button-adoption", () => false)).toEqual([]);
    expect(addonPresent(REPO_ROOT, "addons/never-existed/frontend/x.tsx")).toBe(
      false,
    );
    expect(addonPresent(REPO_ROOT, "frontend/src/components/Button.tsx")).toBe(
      true,
    );
  });

  it("cannot be handed a predicate that opens an undeclared window", () => {
    // `present` filters the declarations; it does not add to them.
    expect(openWindows("button-adoption", () => true)).toHaveLength(1);
  });
});
