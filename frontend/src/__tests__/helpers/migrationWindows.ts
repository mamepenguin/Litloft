import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ledger entries that are mid-migration across two repositories.
 *
 * The detectors in this directory are migration ledgers: they hold the files
 * that still write a heading, or a button recipe, by hand, and shrink as those
 * files are converted. That works while the ledger and the file are in one
 * repository. It deadlocks when they are not.
 *
 * An addon's own CI checks out core at `develop`, drops the addon's commit
 * into it, and runs **core's** suite — so core's ledger decides whether the
 * addon's pull request can go green. The addon PR converts a file; core's
 * ledger still says that file is unconverted; the addon PR is red. Updating
 * core's ledger first turns core red instead, because core still pins the
 * unconverted commit. Neither side can go first.
 *
 * This is the mirror of a hazard core's addon CI already documents — that an
 * addon's result is not reproducible because `develop` moves under it. Same
 * root: the addon's frontend tests only run when its tree is fitted into a
 * core checkout.
 *
 * A window names **both endpoints** and nothing else. It is not `>=`, and it
 * is not a subset: an observation that is neither `before` nor `after` still
 * fails, with both values in the message. What it buys is exactly the width
 * the migration actually crosses, for exactly as long as it is crossing.
 *
 * **Two residuals, both deliberate and neither closed by this mechanism.**
 *
 * *Per window, not per pull request.* Each entry is independent, so a ledger
 * holding `n` open windows admits 2ⁿ combinations — C2 declares seven, and a
 * tree where four of its conversions landed and three did not is green on
 * both sides. "Exactly the width the migration crosses" is a claim about one
 * window. Nothing here can tell a half-applied pull request from a whole one,
 * because nothing here knows the windows belong to the same one.
 *
 * *Closing is not enforced, only assigned.* Core cannot tell "the pointer has
 * moved past this migration" from "the addon's CI substituted its tree", and
 * those are the same observation from inside the suite. So a bump that leaves
 * its windows behind stays green. `PENDING_PRS` catches only the ordering
 * where the PR removes itself from that list first. **The acceptance
 * conditions in the phase spec are the real guarantee**, and this is written
 * down so that nobody mistakes the tripwire for one.
 *
 * **Windows are for addon paths only.** The deadlock they exist for is a
 * two-repository one; a core path has no second repository to wait for, and
 * the heading ledger's subtraction is keyed per addon root and would not
 * apply to one.
 *
 * **Every entry names the pull request that deletes it**, and that name is
 * checked against the PRs this phase still has open. "Migrating" alone tells
 * the next reader nothing about when it ends, and a relaxation nobody is
 * assigned to remove becomes a permanently loose detector — the same thing as
 * never having had a strict one.
 */
export type Ledger = "page-headings" | "button-adoption";

export interface MigrationWindow {
  /**
   * How many the ledger counts **for this file** while it holds the old
   * shape — never a total over a directory. Both callers pass a per-file
   * count and both subtract `before` from a listed total, so a root sum here
   * would be added back at the wrong granularity. The first draft of
   * `page-headings` passed a root total, which agreed with a file count only
   * because media_import has one heading in one file.
   */
  before: number;
  /** How many for that same file once the addon's pull request has landed. */
  after: number;
  /**
   * The pull request that removes this entry, by name. Must be one of
   * `PENDING_PRS`: an entry closed by something already shipped is an entry
   * nobody will come back for.
   */
  closedBy: string;
  /** Why the pair is unavoidable here, in one line. */
  why: string;
}

/**
 * Phase 3 pull requests that have not landed yet, and which addon pointers
 * each one moves.
 *
 * A window may only be closed by a PR that **bumps the addon whose file the
 * window names**. Two earlier versions were weaker: a regex on the shape of
 * `closedBy` let `"A1"` — shipped weeks ago — and `"Z9"` — never planned —
 * through, and a flat list of names let a media_import window be closed by
 * `"C3"`, which is knowledge's, or `"D5"`, which bumps neither. A name that
 * passes a check is not an assignment unless the check knows what the name
 * is for.
 *
 * Shrinks as the phase lands. When the last entry goes, so does this list.
 */
export const PENDING_PRS: Record<string, { bumps: readonly string[] }> = {
  C1: { bumps: [] },
  C2: { bumps: [] },
  C3: { bumps: [] },
  D1: { bumps: ["media_import", "intelligence", "knowledge"] },
  D2: { bumps: [] },
  D3: { bumps: [] },
  D4: { bumps: [] },
  D5: { bumps: ["intelligence"] },
};

/** The addon a window's path belongs to, or `null` for a core path. */
export function addonOf(path: string): string | null {
  return path.startsWith("addons/") ? path.split("/")[1] : null;
}

/**
 * Keyed by ledger **then** path, not by path alone.
 *
 * The first version keyed by path and carried the ledger as a field, which
 * recognised that one path can appear in both ledgers without being able to
 * hold it: a second entry for the same file is a duplicate key, and `tsc`
 * rejects it (TS1117). Four paths are already on both ledgers —
 * `intelligence/Page.tsx`, `pages/find.tsx`, `pages/search-compare.tsx` and
 * `knowledge/FolderView.tsx` — so C2 and C3 need what C1 happened not to.
 */
export const MIGRATION_WINDOWS: Record<
  Ledger,
  Record<string, MigrationWindow>
> = {
  "page-headings": {
    "addons/media_import/frontend/Page.tsx": {
      before: 1,
      after: 0,
      closedBy: "D1",
      why: "PR C1 moves this page's <h1> into core's PageHeader",
    },
  },
  "button-adoption": {
    "addons/media_import/frontend/Composer.tsx": {
      before: 1,
      after: 0,
      closedBy: "D1",
      why: "PR C1 converts this button to core's Button",
    },
  },
};

/**
 * The windows of one ledger whose file this checkout actually holds.
 *
 * `present` decides only whether a *declared* window is in play; it cannot
 * open one that is not declared.
 */
export function openWindows(
  ledger: Ledger,
  present: (path: string) => boolean,
): string[] {
  return Object.keys(MIGRATION_WINDOWS[ledger]).filter(present);
}

/** Is the addon holding this window's file checked out at all? */
export function addonPresent(repoRoot: string, path: string): boolean {
  if (!path.startsWith("addons/")) return true;
  return existsSync(resolve(repoRoot, path.split("/").slice(0, 3).join("/")));
}

/**
 * As `windowSide`, but against a map given to it.
 *
 * A separate entry point rather than an option on the other one. The fixture
 * that shows per-ledger resolution needs a map holding one path on both
 * ledgers, which the declared one will not have until C2 — but offering that
 * as `opts.windows?` made it an *optional* parameter on the production
 * function, and a detector passing `{ before: 99, after: 0 }` then bypassed
 * the whole mechanism with nothing failing. The signature is the guard:
 * `windows` is required here and absent there, so a production caller cannot
 * reach it and no convention has to be remembered to keep that true.
 *
 * The observed count for one window's file, checked against exactly two
 * declared endpoints.
 *
 * Returns which endpoint was seen; throws with both values named when it is
 * neither, and when the file itself has gone. A deleted file counts nothing,
 * which is indistinguishable from a converted one unless it is asked about
 * separately — and no migration in this phase deletes a file.
 */
export function windowSideIn(
  windows: typeof MIGRATION_WINDOWS,
  observed: number,
  ledger: Ledger,
  path: string,
  // Taken, not looked up: a guard that reads the filesystem itself can only
  // be tested by making a file disappear, and the first test written for this
  // one passed against an *undeclared* path instead — the wrong error, from
  // the line above.
  opts: { exists: boolean },
): "before" | "after" {
  const w = windows[ledger]?.[path];
  if (!w) throw new Error(`${ledger}:${path}: no migration window is declared`);
  if (!opts.exists) {
    throw new Error(
      `${ledger}:${path}: the file is gone. A window spans a conversion, ` +
        `not a deletion — ${w.closedBy} should be removing this entry, not ` +
        `inheriting a missing file.`,
    );
  }
  if (observed === w.before) return "before";
  if (observed === w.after) return "after";
  throw new Error(
    `${ledger}:${path}: expected ${w.before} (before ${w.closedBy}) or ` +
      `${w.after} (after it), got ${observed}. ${w.why}`,
  );
}

/**
 * As above, against the declared windows and nothing a caller substitutes.
 *
 * Delegates, so the fixture test exercises the production code path rather
 * than a parallel copy of it.
 */
export function windowSide(
  observed: number,
  ledger: Ledger,
  path: string,
  opts: { exists: boolean },
): "before" | "after" {
  return windowSideIn(MIGRATION_WINDOWS, observed, ledger, path, opts);
}
