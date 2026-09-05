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
 * **Every entry names the pull request that deletes it.** "Migrating" alone
 * tells the next reader nothing about when it ends, and a relaxation nobody
 * is assigned to remove becomes a permanently loose detector — which is the
 * same thing as never having had a strict one.
 */
export type Ledger = "page-headings" | "button-adoption";

export interface MigrationWindow {
  /**
   * Which detector's ledger this entry belongs to.
   *
   * Two detectors key by path and a path can appear in both, so a window
   * without this was read by whichever ran — `Page.tsx`'s heading window
   * was counted against the button ledger and took a site off a total it
   * had never been in.
   */
  ledger: Ledger;
  /** The ledger's value while the addon still holds the old shape. */
  before: number;
  /** Its value once the addon's pull request has landed. `0` means gone. */
  after: number;
  /**
   * The pull request that removes this entry, by name. Its acceptance
   * conditions must include the removal — see the Phase 3 spec.
   */
  closedBy: string;
  /** Why the pair is unavoidable here, in one line. */
  why: string;
}

/**
 * Keyed by the path each detector already keys its own ledger by.
 *
 * Phase 3 C2 and C3 reuse this shape for intelligence and knowledge; the
 * cycle is the same for every addon whose files a core detector counts.
 */
export const MIGRATION_WINDOWS: Record<string, MigrationWindow> = {
  "addons/media_import/frontend/Page.tsx": {
    ledger: "page-headings",
    before: 1,
    after: 0,
    closedBy: "D1",
    why: "PR C1 moves this page's <h1> into core's PageHeader",
  },
  "addons/media_import/frontend/Composer.tsx": {
    ledger: "button-adoption",
    before: 1,
    after: 0,
    closedBy: "D1",
    why: "PR C1 converts this button to core's Button",
  },
};

/**
 * The observed value, checked against exactly two declared endpoints.
 *
 * Returns which endpoint was seen so a caller can report it; throws with both
 * values named when it is neither.
 */
/** The declared windows for one ledger, whose file this checkout holds. */
export function openWindows(ledger: Ledger, present: (path: string) => boolean): string[] {
  return Object.entries(MIGRATION_WINDOWS)
    .filter(([path, w]) => w.ledger === ledger && present(path))
    .map(([path]) => path);
}

export function windowSide(
  observed: number,
  path: string,
): "before" | "after" {
  const w = MIGRATION_WINDOWS[path];
  if (!w) throw new Error(`${path}: no migration window is declared`);
  if (observed === w.before) return "before";
  if (observed === w.after) return "after";
  throw new Error(
    `${path}: expected ${w.before} (before ${w.closedBy}) or ${w.after} ` +
      `(after it), got ${observed}. ${w.why}`,
  );
}
