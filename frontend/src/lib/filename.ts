/**
 * Only the last dot counts, matching `Path(...).stem` on the backend
 * (`archive.tar.gz` → stem `archive.tar`).
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
 * Mirrors `fileops.validate_filename`, which stays authoritative. Length is
 * counted in **code points**, not UTF-16 units, because Python's `len()`
 * does.
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

export function selectStem(el: HTMLInputElement): void {
  el.focus();
  const { stem, ext } = splitFilename(el.value);
  if (ext) el.setSelectionRange(0, stem.length);
  else el.select();
}

export function siblingPath(path: string, newName: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? newName : `${path.slice(0, idx)}/${newName}`;
}
