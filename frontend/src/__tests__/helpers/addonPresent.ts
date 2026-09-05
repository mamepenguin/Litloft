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
 * This outlived `migrationWindows.ts`, folded once the last cross-repository
 * migration finished: the two-repository deadlock that module existed for is
 * over, and this condition is not.
 *
 * **It is not what makes a ledger pass on a submodule-less clone.** The
 * button ledger drops the absent addon's entries from both sides; the
 * heading ledger asserts each addon's count only where the addon is there,
 * and tests its own staleness rule against a fixture tree rather than
 * against `addons/knowledge`, which is what it did until those three cases
 * were the only thing failing such a clone.
 */
export function addonPresent(repoRoot: string, path: string): boolean {
  if (!path.startsWith("addons/")) return true;
  return existsSync(resolve(repoRoot, path.split("/").slice(0, 3).join("/")));
}
