import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
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
  const start = source.indexOf(`${name}: dict[str, tuple[str, ...]] = {`);
  expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n}", open);
  expect(close, `${name} has no closing brace`).toBeGreaterThan(open);
  const body = source.slice(open + 1, close);

  const table: Record<string, string[]> = {};
  for (const m of body.matchAll(/"([^"]+)":\s*\(([^)]*)\)/g)) {
    table[m[1]] = [...m[2].matchAll(/"([^"]*)"/g)].map((v) => v[1]);
  }
  expect(Object.keys(table).length, `${name} parsed as empty`).toBeGreaterThan(0);
  return table;
}

const ADDON_DIR = resolve(REPO_ROOT, "addons/intelligence");

describe("file-kind classifier, core vs the intelligence addon", () => {
  // A clone without `--recurse-submodules` leaves `addons/` empty, and
  // that is not a defect in anything. But an intelligence checkout that
  // *is* there and has no `file_kind.py` is a stale pin — core offering
  // markdown and pdf in search over an index that cannot honour them —
  // so that case fails rather than skips. This is what makes the
  // gitlink load-bearing (`00-basis.md`, "bump を core PR に同梱するか").
  const present = existsSync(ADDON_DIR);
  if (present) {
    it("is pinned to an intelligence that knows the vocabulary", () => {
      expect(existsSync(ADDON), `${ADDON} is missing — stale submodule pin?`).toBe(
        true,
      );
    });
  }
  const readable = present && existsSync(ADDON);
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
    for (const [label, text, column] of [
      ["core", core, "File.filename"],
      ["addon", addon, "IndexedFile.filename"],
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
