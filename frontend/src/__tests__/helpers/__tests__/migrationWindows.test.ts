import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  MIGRATION_WINDOWS,
  PENDING_PRS,
  addonOf,
  addonPresent,
  openWindows,
  windowSide,
  windowSideIn,
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

  it("names a pull request that will actually reach this file", () => {
    // Three versions of this check. A regex on the shape admitted "A1",
    // shipped weeks ago, and "Z9", never planned. A flat list of open PRs
    // admitted "C3" — knowledge's — on a media_import window. What closes a
    // window is the PR that moves that addon's pointer, so that is what is
    // asserted.
    for (const [ledger, windows] of Object.entries(MIGRATION_WINDOWS)) {
      for (const [path, w] of Object.entries(windows)) {
        const where = `${ledger}:${path}`;
        expect(Object.keys(PENDING_PRS), where).toContain(w.closedBy);
        const addon = addonOf(path);
        expect(addon, where).not.toBeNull();
        expect(PENDING_PRS[w.closedBy].bumps, where).toContain(addon);
        expect(w.why.length, where).toBeGreaterThan(0);
      }
    }
  });

  it("declares windows for addon paths only", () => {
    // The deadlock is a two-repository one. A core path has no second
    // repository to wait for, and the heading ledger's subtraction is keyed
    // per addon root — so a core window would be excused by the staleness
    // rule while never being subtracted from a count. Input the helper
    // accepts and the detectors cannot handle is a gap, not a feature.
    for (const windows of Object.values(MIGRATION_WINDOWS)) {
      for (const path of Object.keys(windows)) {
        expect(addonOf(path), path).not.toBeNull();
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

  it("lets one path hold a window on each ledger, with different answers", () => {
    // Against a fixture, because the declared map has no such path yet and
    // C2 is the PR that adds four. The first version of this test asserted
    // the key names and that each value was an object — it passed with both
    // ledgers emptied, which is to say it asserted nothing about the property
    // its name promises.
    const SHARED = "addons/intelligence/frontend/Page.tsx";
    const fixture = {
      "page-headings": {
        [SHARED]: { before: 1, after: 0, closedBy: "D1", why: "heading" },
      },
      "button-adoption": {
        [SHARED]: { before: 3, after: 0, closedBy: "D1", why: "recipes" },
      },
    };
    // `windowSideIn`, not `windowSide` with an option: an injectable map on
    // the production function was a way for a *detector* to substitute its
    // own endpoints, which one did in a mutation with nothing failing. The
    // required first argument is the guard.
    const at = (ledger: "page-headings" | "button-adoption", n: number) =>
      windowSideIn(fixture, n, ledger, SHARED, { exists: true });

    expect(at("page-headings", 1)).toBe("before");
    expect(at("button-adoption", 3)).toBe("before");
    expect(at("page-headings", 0)).toBe("after");
    expect(at("button-adoption", 0)).toBe("after");
    // The other ledger's endpoint is not this one's.
    expect(() => at("page-headings", 3)).toThrow(/expected 1 .*or 0/);
    expect(() => at("button-adoption", 1)).toThrow(/expected 3 .*or 0/);
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

  it("names addons that exist", () => {
    // Both hand-written tables — the windows' paths and `bumps` — spell addon
    // directory names, and a typo in either would read as a considered entry
    // while matching nothing.
    const declared = new Set<string>();
    for (const windows of Object.values(MIGRATION_WINDOWS)) {
      for (const path of Object.keys(windows)) declared.add(addonOf(path)!);
    }
    for (const { bumps } of Object.values(PENDING_PRS)) {
      for (const addon of bumps) declared.add(addon);
    }
    for (const addon of declared) {
      expect(
        addonPresent(REPO_ROOT, `addons/${addon}/frontend/x.tsx`),
        addon,
      ).toBe(true);
    }
  });
});
