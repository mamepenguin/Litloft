import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Is the addon holding this path checked out at all?
 *
 * A `git clone` without `--recurse-submodules` leaves `addons/*` empty, and
 * a ledger that counts an absent addon's files as converted reports a diff
 * with nothing in it naming the cause. **An absent addon is absent, not
 * converted.**
 *
 * Core paths are always present, so they answer true.
 *
 * This outlived `migrationWindows.ts`, which D1b folded once the last
 * cross-repository migration finished. The two-repository *deadlock* that
 * module existed for is over; a checkout that simply lacks the submodule is
 * not, and both ledgers still have to answer for it.
 */
export function addonPresent(repoRoot: string, path: string): boolean {
  if (!path.startsWith("addons/")) return true;
  return existsSync(resolve(repoRoot, path.split("/").slice(0, 3).join("/")));
}
