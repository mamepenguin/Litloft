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
