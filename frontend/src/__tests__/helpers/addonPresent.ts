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
 * **This is what makes the button ledger pass on a submodule-less clone**,
 * and nothing else does: `expected()` filters `NOT_CONVERTED` through it, so
 * both sides lose the absent addon together. Neutered to `return true`, that
 * ledger fails such a clone on two assertions.
 *
 * The heading ledger reaches the same place by three routes rather than one:
 * this function in its staleness rule, an `existsSync` guard on each addon's
 * expected count, and a fixture tree for the rule's own cases — which used
 * to be `addons/knowledge` paths, and were the last thing failing such a
 * clone in that file.
 */
export function addonPresent(repoRoot: string, path: string): boolean {
  if (!path.startsWith("addons/")) return true;
  return existsSync(resolve(repoRoot, path.split("/").slice(0, 3).join("/")));
}
