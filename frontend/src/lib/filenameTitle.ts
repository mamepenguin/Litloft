import { splitFilename } from "@/lib/filename";

/**
 * The title a file is given when it is first indexed.
 *
 * A second implementation of `_filename_to_title`
 * (`backend/app/services/fileops.py`), which cannot be shared: one runs in
 * a Python container and the other in a browser. They are kept honest by a
 * table both test suites read
 * (`backend/tests/fixtures/filename_title.json`), the same arrangement
 * `filename_validation.json` already uses.
 *
 * It exists because the search result row has to know whether repeating a
 * filename under a title says anything the title does not, and that
 * question has no answer unless both sides agree on how the title was
 * derived in the first place.
 *
 * The rule has three steps, and missing any one of them makes the answer
 * wrong for a large share of real filenames:
 *
 *  1. Drop the extension — the last one only, so `archive.tar.gz` keeps
 *     `.tar`, and a dot with nothing after it is not one (see
 *     `titleStem`).
 *  2. Underscores become spaces. A hyphen does not: it is a character
 *     someone chose, and often the only thing holding a compound together.
 *  3. Upper-case the first character — the first *code point*, not the
 *     first code unit. Nothing else is recased: `toUpperCase` on the whole
 *     word would turn `MacBook` into `MACBOOK`, and a title-casing pass
 *     would turn `charon's` into `Charon'S`.
 *
 * A name that is all separators has no title to make, so it keeps its stem
 * verbatim.
 */
export function filenameToTitle(filename: string): string {
  const stem = titleStem(filename);
  const name = stripPythonWhitespace(stem.replace(/_/g, " "));
  if (!name) return stem;
  // By code point, not by code unit. `charAt(0)` on a character above the
  // BMP returns a lone high surrogate, which upper-cases to itself, so
  // `𐐨ary` would come back unchanged while Python upper-cases the whole
  // code point.
  const first = name.codePointAt(0)!;
  const head = String.fromCodePoint(first);
  return head.toUpperCase() + name.slice(head.length);
}

/**
 * Python's whitespace, which is not JavaScript's.
 *
 * `String.prototype.trim` strips U+FEFF and Python's `str.strip` does not,
 * so a BOM-prefixed name — a routine artifact of a Windows export — would
 * have a different first character on each side and therefore a different
 * title. Python strips U+0085 and the U+001C-1F separators, which JS does
 * not, so those diverge the other way.
 *
 * Written out rather than composed from `\s`, because the point is that
 * the two definitions differ and a regex that means "whitespace" in this
 * language is the wrong one.
 */
const PYTHON_WHITESPACE =
  "\\t\\n\\v\\f\\r\\x1c\\x1d\\x1e\\x1f\\x85 " +
  "\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PYTHON_STRIP = new RegExp(
  `^[${PYTHON_WHITESPACE}]+|[${PYTHON_WHITESPACE}]+$`,
  "g",
);

function stripPythonWhitespace(value: string): string {
  return value.replace(PYTHON_STRIP, "");
}

/**
 * `Path(...).stem` as the backend's Python sees it.
 *
 * `splitFilename` is the frontend's own extension boundary and is used by
 * rename, where a trailing dot is not a case that arises. It is not used
 * here, because CPython disagrees with it — and with itself across
 * versions: `Path("notes.").stem` is `"notes."` on 3.12, which the backend
 * container runs, and `"notes"` on 3.14. A dot with nothing after it is
 * not a suffix on 3.12 (`0 < i < len(name) - 1` fails), so the whole name
 * is the stem.
 *
 * Pinned to what the backend actually runs. If its image moves to a Python
 * that changed this, the shared table goes red — which is the table doing
 * its job rather than a defect in it.
 */
function titleStem(filename: string): string {
  if (filename.endsWith(".")) return filename;
  return splitFilename(filename).stem;
}
