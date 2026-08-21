/**
 * Split a filename at its extension boundary.
 *
 * The single definition of that boundary for the whole frontend — batch
 * rename computes new names with it, and {@link selectStem} decides what
 * to highlight with it. Two copies of this rule would drift.
 *
 * Only the last dot counts, matching `Path(...).stem` on the backend
 * (`archive.tar.gz` → stem `archive.tar`). A leading dot is not a
 * boundary (`lastDot <= 0`), so `.gitignore` is all stem and no
 * extension; the backend rejects hidden files outright anyway.
 */
export function splitFilename(filename: string): { stem: string; ext: string } {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) {
    return { stem: filename, ext: "" };
  }
  return {
    stem: filename.substring(0, lastDot),
    ext: filename.substring(lastDot),
  };
}

/** Mirrors `MAX_FILENAME_LENGTH` in `backend/app/services/fileops.py`. */
export const FILENAME_MAX_LENGTH = 255;

/** Mirrors `FORBIDDEN_CHARS` in `backend/app/services/fileops.py`. */
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000]/;

export type FilenameError = "empty" | "forbiddenChars" | "hidden" | "tooLong";

/**
 * Reject a filename the backend would reject, so inline rename can say so
 * without a round-trip. Returns `null` when the name is acceptable.
 *
 * `fileops.validate_filename` stays authoritative — this is a
 * convenience layer, and its errors are still surfaced verbatim. The two
 * are kept honest by a shared table
 * (`backend/tests/fixtures/filename_validation.json`) that both test
 * suites read; see `filenameValidation.parity.test.ts`.
 *
 * The rules, in the backend's order: strip, NFC-normalise, then reject
 * empty / forbidden characters / a leading dot / over 255. Length is
 * counted in **code points**, not UTF-16 units, because Python's `len()`
 * does — otherwise a name of 200 emoji would be rejected here and
 * accepted there.
 */
export function validateFilename(raw: string): FilenameError | null {
  const name = raw.trim().normalize("NFC");
  if (name.length === 0) return "empty";
  if (FORBIDDEN_CHARS.test(name)) return "forbiddenChars";
  // Catches "." and ".." too, exactly as the backend's ordering does.
  if (name.startsWith(".")) return "hidden";
  if ([...name].length > FILENAME_MAX_LENGTH) return "tooLong";
  return null;
}

/**
 * Focus `el` and select only the stem, so the first keystroke replaces
 * the name without destroying the extension. Folders and extensionless
 * files fall through to a full select.
 */
export function selectStem(el: HTMLInputElement): void {
  el.focus();
  const { stem, ext } = splitFilename(el.value);
  if (ext) el.setSelectionRange(0, stem.length);
  else el.select();
}
