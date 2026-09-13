import { splitFilename } from "@/lib/filename";

/**
 * A second implementation of `_filename_to_title`
 * (`backend/app/services/fileops.py`), which cannot be shared: one runs in
 * a Python container and the other in a browser.
 */
export function filenameToTitle(filename: string): string {
  const stem = titleStem(filename);
  const name = stripPythonWhitespace(stem.replace(/_/g, " "));
  if (!name) return stem;
  // By code point, not by code unit. `charAt(0)` on a character above the
  // BMP returns a lone high surrogate, which upper-cases to itself.
  const first = name.codePointAt(0)!;
  const head = String.fromCodePoint(first);
  return head.toUpperCase() + name.slice(head.length);
}

/**
 * Python's whitespace, which is not JavaScript's: `String.prototype.trim`
 * strips U+FEFF and Python's `str.strip` does not; Python strips U+0085 and
 * the U+001C-1F separators, which JS does not.
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
 * `Path(...).stem` as the backend's Python sees it: `Path("notes.").stem` is
 * `"notes."` on 3.12, which the backend container runs, and `"notes"` on 3.14.
 */
function titleStem(filename: string): string {
  if (filename.endsWith(".")) return filename;
  return splitFilename(filename).stem;
}
