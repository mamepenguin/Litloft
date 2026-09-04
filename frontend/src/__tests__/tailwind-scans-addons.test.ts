/**
 * Every utility an addon uses has to reach the stylesheet.
 *
 * Tailwind finds its own sources by walking out from `globals.css`, and
 * it skips both gitignored paths and symlinks. `src/addons/*` is both —
 * `setup-addons.sh` makes the symlinks and the repository-root
 * `.gitignore` lists them — so before `@source "../addons"` was added, a
 * class appearing ONLY in an addon generated no CSS at all.
 *
 * The failure was silent in the worst way. An addon writing
 * `opacity-0 group-hover/cue:opacity-100` got the `opacity-0` — core
 * uses that one — and not the reveal, so the control was invisible
 * forever with every test and type-check green. And it was invisible
 * only locally: `frontend/Dockerfile` copies the addon trees in as real
 * files, so the production build was always correct. The build nobody
 * inspects was right and the one everybody develops against was wrong.
 *
 * Measured on the pinned Tailwind 4.2.2, compiling the real
 * `globals.css` through `@tailwindcss/postcss`:
 *
 *     without @source: 104,478 bytes, 0 occurrences of `cue`
 *     with    @source: 131,348 bytes, 4 occurrences of `cue`
 *
 * What this test checks is the declaration and that it points somewhere
 * real. It does NOT recompile the stylesheet: doing that from vitest
 * needs `postcss` as a direct dependency, which this project does not
 * have (Next supplies it), and adding a package to watch one line is a
 * bigger footprint than the line. The scenario that would slip past —
 * Tailwind changing what `@source` means — is remote, and the numbers
 * above are here so the next person can re-measure in a minute rather
 * than rediscover the problem.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = resolve(here, "../app/globals.css");

describe("Tailwind's source list", () => {
  it("names the addons directory", () => {
    expect(readFileSync(globalsCss, "utf8")).toContain('@source "../addons"');
  });

  it("names a directory that actually holds the addon frontends", () => {
    // The string on its own could rot into a path that no longer exists,
    // and Tailwind does not complain about a source that matches nothing
    // — it would simply go back to emitting no addon utilities, which is
    // the state this line was added to end.
    const addons = resolve(here, "../addons");
    expect(statSync(addons).isDirectory()).toBe(true);

    const entries = readdirSync(addons, { withFileTypes: true }).filter(
      (e) => !e.name.startsWith("."),
    );
    // `setup-addons.sh` has to have run; the frontend CI job asserts the
    // same thing from the other direction by checking vitest collected
    // each addon's tests.
    expect(entries.length).toBeGreaterThan(0);

    // At least one of them has to contain something Tailwind would scan,
    // or the source is pointing at a shell.
    const scannable = entries.some((entry) => {
      const dir = resolve(addons, entry.name);
      try {
        return readdirSync(dir).some((f) => /\.(tsx|ts|jsx|js)$/.test(f));
      } catch {
        return false;
      }
    });
    expect(scannable).toBe(true);
  });
});
