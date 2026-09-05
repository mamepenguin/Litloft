import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  MIGRATION_WINDOWS,
  PENDING_BUMPS,
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
const PATH = "addons/knowledge/frontend/MoveDialog.tsx";

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
      windowSide(0, "button-adoption", "addons/knowledge/frontend/api.ts", there),
    ).toThrow(/no migration window/);
  });

  it("refuses a path declared on the other ledger", () => {
    // The same file can hold a window on each ledger, so asking the wrong one
    // must not resolve. One path holds one on each.
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
    // Four versions of this check. A regex on the shape admitted "A1",
    // shipped weeks ago, and "Z9", never planned. A flat list of open PRs
    // admitted "C3" — knowledge's — on a media_import window. The third held
    // every unlanded PR of the phase, seven of nine with an empty `bumps`,
    // which no window could name and this loop never reached. What closes a
    // window is the PR that moves that addon's pointer, so that is the only
    // thing the list holds.
    for (const [ledger, windows] of Object.entries(MIGRATION_WINDOWS)) {
      for (const [path, w] of Object.entries(windows)) {
        const where = `${ledger}:${path}`;
        expect(Object.keys(PENDING_BUMPS), where).toContain(w.closedBy);
        const addon = addonOf(path);
        expect(addon, where).not.toBeNull();
        expect(PENDING_BUMPS[w.closedBy].bumps, where).toContain(addon);
        expect(w.why.length, where).toBeGreaterThan(0);
      }
    }
  });

  it("holds exactly these pull requests, and exactly the pointers each moves", () => {
    // The whole table, not a property of each row. `bumps.length > 0` alone
    // was the first version and it is a lower bound in a file that enumerates
    // its other table exactly: it admitted an invented name, admitted a
    // `bumps` widened to addons the PR does not touch — which widens what
    // `closedBy` accepts, the one thing this table exists to constrain — and
    // did not notice an entry disappearing.
    //
    // The name says both halves because the second does the work the first
    // cannot: the key set alone would let the pointers be rewritten.
    expect(Object.keys(PENDING_BUMPS).sort()).toEqual(["D1b", "D5"]);
    expect([...PENDING_BUMPS.D1b.bumps].sort()).toEqual(["knowledge"]);
    expect([...PENDING_BUMPS.D5.bumps].sort()).toEqual(["intelligence"]);
  });

  it("gives every entry at least one pointer to move", () => {
    // The property, kept beside the values rather than inferred from them.
    //
    // The two tests separate on whether the pinned expectations were updated
    // to match, and not on anything about emptiness. The equality catches a
    // change the pins were not moved for — an added entry, empty or not, is
    // caught the same way and for the same reason. This one catches an empty
    // `bumps` whether or not they were moved, which is the case that matters:
    // an entry with no pointers is unnameable by any `closedBy` and invisible
    // to `names addons that exist`, so emptying one and correcting its pin in
    // the same edit would put back the unreachable entry the narrowing exists
    // to remove.
    //
    // An earlier version of the comment above claimed the equality gave this
    // for free. It drew the line at added-versus-edited, which is not where
    // it falls: adding an empty entry and accommodating both pins passes the
    // equality too.
    for (const [pr, { bumps }] of Object.entries(PENDING_BUMPS)) {
      expect(bumps.length, pr).toBeGreaterThan(0);
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
    // rejects — which intelligence needs and media_import happened not to.
    //
    // Both ledgers in full, sorted, rather than a count or the one path that
    // differs between them. A count would let a window move from one ledger to
    // the other unnoticed, which is the whole distinction being asserted.
    expect(openWindows("button-adoption", () => true).sort()).toEqual(
      [
        "addons/knowledge/frontend/CaptureBasket.tsx",
        "addons/knowledge/frontend/ClipDuplicateDialog.tsx",
        "addons/knowledge/frontend/ClipInput.tsx",
        "addons/knowledge/frontend/ClipPasteForm.tsx",
        "addons/knowledge/frontend/FolderView.tsx",
        "addons/knowledge/frontend/KnowledgeDashboard.tsx",
        "addons/knowledge/frontend/MoveDialog.tsx",
        "addons/knowledge/frontend/UnresolvedLinkDialog.tsx",
      ].sort(),
    );
    expect(openWindows("page-headings", () => true).sort()).toEqual([
      "addons/knowledge/frontend/FolderView.tsx",
    ]);
  });

  it("declares a path on both ledgers at once", () => {
    // What makes the ledger-then-path keying load-bearing rather than
    // hypothetical. While only media_import held windows, the two were
    // `Page.tsx` and `Composer.tsx` — different names, so keying by path alone
    // still type-checked and the nesting was carrying nothing. One path holds
    // a window on each ledger today, and keying by path alone is a duplicate
    // key: `tsc` reports TS1117 once per shared path. That is checked by the
    // type system on every run, not here; what is held here is the population
    // it depends on, so a change that empties it cannot pass silently.
    const onBoth = Object.keys(MIGRATION_WINDOWS["page-headings"]).filter(
      (path) => path in MIGRATION_WINDOWS["button-adoption"],
    );
    expect(onBoth.sort()).toEqual(["addons/knowledge/frontend/FolderView.tsx"]);
  });

  it("lets one path hold a window on each ledger, with different answers", () => {
    // Against a fixture, because every declared window today runs 1 → 0 and
    // so cannot show a count resolving *differently* per ledger — the property
    // this test is named for. That the declared map holds a path on both
    // ledgers is asserted separately, above. The first version of this test
    // asserted the key names and that each value was an object; it passed with
    // both ledgers emptied, which is to say it asserted nothing at all.
    //
    // The endpoints below are 1-vs-3 rather than 1-vs-1 for that reason. A
    // pair matching the declarations would pass whichever ledger resolved it.
    const SHARED = "addons/knowledge/frontend/FolderView.tsx";
    const fixture = {
      "page-headings": {
        [SHARED]: { before: 1, after: 0, closedBy: "D1b", why: "heading" },
      },
      "button-adoption": {
        [SHARED]: { before: 3, after: 0, closedBy: "D1b", why: "recipes" },
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
    // `present` filters the declarations; it does not add to them. The count
    // is the declared population, so a predicate that invented a path would
    // have to invent it here too.
    expect(openWindows("button-adoption", () => true)).toHaveLength(8);
    expect(openWindows("page-headings", () => true)).toHaveLength(1);
  });

  it("names addons that exist", () => {
    // Both hand-written tables — the windows' paths and `bumps` — spell addon
    // directory names, and a typo in either would read as a considered entry
    // while matching nothing. Every `PENDING_BUMPS` entry is reached, because
    // the test above refuses an entry with no pointers.
    const declared = new Set<string>();
    for (const windows of Object.values(MIGRATION_WINDOWS)) {
      for (const path of Object.keys(windows)) declared.add(addonOf(path)!);
    }
    for (const { bumps } of Object.values(PENDING_BUMPS)) {
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
