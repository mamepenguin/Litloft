import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

/**
 * Core and the intelligence addon classify file kinds from the same two
 * tables, written twice.
 *
 * The addon runs in its own container and cannot import core, so this
 * is the same situation as the two `frontmatter.py` parsers — except
 * that those are left to PR review, and this one is not. The reason is
 * the failure mode: a filter that disagrees with core does not raise,
 * it returns nothing, and an empty semantic result reads as "nothing
 * about this in your library". A parser that drifts at least produces
 * visible nonsense.
 *
 * The tables are read out of both sources rather than restated here.
 * A copy in this file would be a third implementation, and three
 * copies agreeing proves less than two do.
 *
 * This makes the gitlink load-bearing: a core PR that moves core's
 * table without bumping `addons/intelligence` fails here, and so does
 * a bump to an addon commit that moved its own. That is the intent —
 * see `00-basis.md` "bump を core PR に同梱するか、分離するか".
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CORE = resolve(REPO_ROOT, "backend/app/routers/drives.py");
const ADDON = resolve(REPO_ROOT, "addons/intelligence/app/file_kind.py");

/**
 * Pull one `name: dict[str, tuple[str, ...]] = { … }` literal out of a
 * Python source and return it as a plain object. Deliberately narrow:
 * it understands the shape these two tables are written in and nothing
 * else, so a table rewritten into some other form fails loudly here
 * instead of being silently read as empty.
 */
function pythonTable(source: string, name: string): Record<string, string[]> {
  // Anchored to the start of a line: a bare `indexOf` also matches
  // `_KIND_MIMES` when asked for `KIND_MIMES`, so a rename that only
  // adds a prefix would resolve to the renamed table and the guard
  // would report agreement with itself.
  const anchor = new RegExp(
    `^${name.replace(/[$_]/g, "\\$&")}: dict\\[str, tuple\\[str, \\.\\.\\.\\]\\] = \\{`,
    "m",
  ).exec(source);
  expect(anchor, `${name} not found — was it renamed?`).not.toBeNull();
  const start = anchor!.index;
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n}", open);
  expect(close, `${name} has no closing brace`).toBeGreaterThan(open);
  const body = source.slice(open + 1, close);

  const table: Record<string, string[]> = {};
  for (const m of body.matchAll(/"([^"]+)":\s*\(([^)]*)\)/g)) {
    table[m[1]] = [...m[2].matchAll(/"([^"]*)"/g)].map((v) => v[1]);
  }
  // Every key in the literal has to have been read. Without this an
  // entry rewritten from a tuple to a list simply vanishes from the
  // parsed table — and if both sides are rewritten, two tables that
  // genuinely diverge compare equal because the diverging key is
  // missing from both.
  const declared = [...body.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
  expect(Object.keys(table).sort(), `${name} has an entry this parser cannot read`).toEqual(
    declared.sort(),
  );
  expect(declared.length, `${name} parsed as empty`).toBeGreaterThan(0);
  return table;
}

/** One `def name(...)` body: from its line to the next top-level `def`. */
function functionBody(source: string, name: string): string {
  const start = new RegExp(`^def ${name}\\(`, "m").exec(source);
  expect(start, `${name} not found — was it renamed?`).not.toBeNull();
  const after = source.slice(start!.index + 1);
  const end = /^def /m.exec(after);
  return end ? after.slice(0, end.index) : after;
}

const ADDON_DIR = resolve(REPO_ROOT, "addons/intelligence");

describe("file-kind classifier, core vs the intelligence addon", () => {
  // Three states, and only one of them is a defect.
  //
  // Git materialises a *directory* for every gitlink on checkout, so a
  // clone without `--recurse-submodules` leaves `addons/intelligence`
  // present and empty — measured, not assumed. That is an uninitialised
  // working copy, not a stale pin, and blaming a pin sends the reader
  // looking for a bump that does not exist. It skips.
  //
  // A checkout with contents but no `file_kind.py` is the real defect:
  // core offering markdown and pdf in search over an index that cannot
  // honour them. That fails, which is what makes the gitlink
  // load-bearing (`00-basis.md`, "bump を core PR に同梱するか").
  const initialised =
    existsSync(ADDON_DIR) && readdirSync(ADDON_DIR).length > 0;
  if (initialised) {
    it("is pinned to an intelligence that knows the vocabulary", () => {
      expect(
        existsSync(ADDON),
        `${ADDON} is missing, and the submodule is initialised — stale pin?`,
      ).toBe(true);
    });
  }
  const readable = initialised && existsSync(ADDON);
  const core = readable ? readFileSync(CORE, "utf-8") : "";
  const addon = readable ? readFileSync(ADDON, "utf-8") : "";

  it.runIf(readable)("agrees on which mime types name a nested kind", () => {
    expect(pythonTable(addon, "KIND_MIMES")).toEqual(
      pythonTable(core, "_KIND_MIMES"),
    );
  });

  it.runIf(readable)("agrees on which extensions name a nested kind", () => {
    expect(pythonTable(addon, "KIND_SUFFIXES")).toEqual(
      pythonTable(core, "_KIND_SUFFIXES"),
    );
  });

  it.runIf(readable)("agrees on the extension fallback existing at all", () => {
    // The tables can match while one side quietly stops consulting the
    // suffixes — which is the drift that costs most, since it only
    // shows on rows whose mime was never recorded. Both predicates
    // lower-case the filename and compare with LIKE; neither may also
    // demand `file_type == "document"`, or the fallback drops exactly
    // the rows it exists for.
    // Sliced to the function, not the file. `drives.py` is 1200 lines;
    // the first case-insensitive filename sort added anywhere else in
    // it would satisfy a whole-file `toContain` while
    // `_apply_kind_filter` had lost its fallback entirely.
    for (const [label, text, column] of [
      ["core", functionBody(core, "_apply_kind_filter"), "File.filename"],
      ["addon", functionBody(addon, "apply_kind_filter"), "IndexedFile.filename"],
    ] as const) {
      expect(text, `${label} stopped lower-casing the filename`).toContain(
        `func.lower(${column})`,
      );
      expect(text, `${label} stopped matching on the suffix`).toMatch(
        /\.like\(f"%\{suffix\}"\)/,
      );
    }
  });

  it.runIf(readable)("has a parser that would notice a rename", () => {
    // Guards the reader itself: three assertions of "these are equal"
    // all pass trivially if both sides parse as the same empty object.
    // `pythonTable` throws on an empty parse, and this fixes that it
    // does.
    expect(() => pythonTable("nothing here", "_KIND_MIMES")).toThrow();
  });
});
