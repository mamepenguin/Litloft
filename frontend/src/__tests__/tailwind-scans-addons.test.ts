/**
 * Every utility an addon uses has to reach the stylesheet.
 *
 * Tailwind finds its own sources by walking out from `globals.css`, and
 * it skips both gitignored paths and symlinks. `src/addons/*` is caught by
 * the first — the repository-root `.gitignore` lists it — and everything
 * `setup-addons.sh` puts inside it is caught by the second, since each file
 * there is a link into an addon repository. So before `@source "../addons"`
 * was added, a class appearing ONLY in an addon generated no CSS at all.
 * Being gitignored is the half that carries the argument, and it is the half
 * that does not change with how the tree is linked.
 *
 * The failure was silent in the worst way. An addon writing
 * `opacity-0 group-hover/cue:opacity-100` got the `opacity-0` — core
 * uses that one — and not the reveal, so the control was invisible
 * forever with every test and type-check green. And it was invisible
 * only locally: `frontend/Dockerfile` copies the addon trees in as real
 * files, so the production build was always correct. The build nobody
 * inspects was right and the one everybody develops against was wrong.
 *
 * What this test checks is the declaration and that it points somewhere
 * real. It does NOT recompile the stylesheet: doing that from vitest
 * needs `postcss` as a direct dependency, which this project does not
 * have (Next supplies it), and adding a package to watch one line is a
 * bigger footprint than the line. The scenario that would slip past —
 * Tailwind changing what `@source` means — is remote.
 *
 * There used to be a measurement here — byte counts, and `0` occurrences
 * of `cue` without `@source` against `4` with it. It is gone rather than
 * updated, because the `0` was wrong and the count cannot mean what it
 * was recorded to mean.
 *
 * Measured by compiling this file's `globals.css` through
 * `@tailwindcss/postcss@4.2.2`, varying one thing at a time:
 *
 *     baseline                          bytes=146138 cue=4
 *     no @source                        bytes=120629 cue=2
 *     no @source, renamed HERE          bytes=120631 cue=0
 *     no @source, renamed in globals    bytes=120629 cue=2
 *
 * (Row 3's two extra bytes are the rename itself — `cue` to a four-character
 * stand-in — not a property of anything. The rows that carry the argument are
 * the `cue` counts and the fact that rows 2 and 4 are byte-identical.)
 *
 * The floor is 2, not 0, and **both come from the prose in this file**:
 * `group-hover/cue` is spelled in the docstring above, Tailwind scans
 * `src/__tests__` (the paragraph beside this one in `globals.css` is
 * about exactly that, and carries an `@source not` for another file that
 * fell into it), and renaming the spelling here takes the count to zero.
 * `globals.css` spells it too and contributes nothing — it is the sheet
 * being compiled, not a scanned source, which the identical byte count on
 * the last row shows.
 *
 * So the count cannot separate "the addon was scanned" from "this
 * docstring was scanned". A sentinel that works needs a spelling that
 * appears in no scanned core file, this one included. Until there is one,
 * the figures live in the PR that measured them, which is dated and is
 * not re-read as though it were still true.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = resolve(here, "../app/globals.css");

const addons = resolve(here, "../addons");

/**
 * The addons `setup-addons.sh` actually linked, if any.
 *
 * Zero of them gates the case below rather than being asserted inside
 * it, because this file is about the `@source` declaration and not about
 * what is installed. That is not a claim that the suite passes with no
 * addons: measured, `addons/` empty fails 7 files and 9 assertions
 * elsewhere here, so a fresh clone without `--recurse-submodules` does
 * not have a green `pnpm test` and never did.
 *
 * The armed state is the one that gates merges: the frontend CI job
 * checks out the submodules, runs `setup-addons.sh`, and then asks the
 * collector whether it picked up each addon's tests.
 */
const linked = existsSync(addons)
  ? readdirSync(addons, { withFileTypes: true }).filter(
      (e) => !e.name.startsWith("."),
    )
  : [];

describe("Tailwind's source list", () => {
  it("names the addons directory", () => {
    // Independent of what is installed: the declaration is core's, and it
    // has to survive every addon being disabled.
    expect(readFileSync(globalsCss, "utf8")).toContain('@source "../addons"');
  });

  it.runIf(linked.length > 0)(
    "names a directory that actually holds the addon frontends",
    () => {
      // The string on its own could rot into a path that no longer exists,
      // and Tailwind does not complain about a source that matches nothing
      // — it would simply go back to emitting no addon utilities, which is
      // the state this line was added to end.
      expect(statSync(addons).isDirectory()).toBe(true);

      // Existential by construction rather than a weakened universal: the
      // claim is about the source path, and one linked addon whose
      // frontend puts every module in a subdirectory is not evidence that
      // `@source` points at a shell.
      const scannable = linked.some((entry) => {
        const dir = resolve(addons, entry.name);
        try {
          return readdirSync(dir).some((f) => /\.(tsx|ts|jsx|js)$/.test(f));
        } catch {
          return false;
        }
      });
      expect(scannable).toBe(true);
    },
  );
});
