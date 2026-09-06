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
 *     `.tar`.
 *  2. Underscores become spaces. A hyphen does not: it is a character
 *     someone chose, and often the only thing holding a compound together.
 *  3. Upper-case the first character. Nothing else is recased —
 *     `String.prototype.toUpperCase` on the whole word would turn
 *     `MacBook` into `MACBOOK`, and a title-casing pass would turn
 *     `charon's` into `Charon'S`.
 *
 * A name that is all separators has no title to make, so it keeps its stem
 * verbatim.
 */
export function filenameToTitle(filename: string): string {
  const stem = splitFilename(filename).stem;
  const name = stem.replace(/_/g, " ").trim();
  if (!name) return stem;
  // `charAt(0)`, not `name[0]`: identical for these inputs, and the one
  // that does not read as an index into a possibly-empty string after the
  // guard above.
  return name.charAt(0).toUpperCase() + name.slice(1);
}
