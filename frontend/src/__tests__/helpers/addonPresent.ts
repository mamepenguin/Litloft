import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A `git clone` without `--recurse-submodules` leaves `addons/*` empty. An
 * absent addon is absent, not converted.
 */
export function addonPresent(repoRoot: string, path: string): boolean {
  if (!path.startsWith("addons/")) return true;
  return existsSync(resolve(repoRoot, path.split("/").slice(0, 3).join("/")));
}
