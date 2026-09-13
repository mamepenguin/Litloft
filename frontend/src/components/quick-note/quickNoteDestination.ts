/**
 * Everything here is convenience state, not user data. It is never
 * treated as authoritative — the accessible-drive response from the API
 * always has the final say, so a stale entry can never reveal or select
 * a drive the viewer can no longer see.
 */

export const QUICK_NOTE_DEFAULT_FOLDER = "Inbox";

export const QUICK_NOTE_LAST_DRIVE_KEY = "quick-note:last-drive";

const MAX_FOLDER_LENGTH = 200;

export function quickNoteDestinationKey(drive: string): string {
  return `quick-note:destination:${drive}`;
}

/**
 * The empty string is valid and means the drive root — that is a real choice
 * in the folder picker, not a missing value.
 */
export function isValidQuickNoteFolder(folder: unknown): folder is string {
  if (typeof folder !== "string") return false;
  if (folder.length > MAX_FOLDER_LENGTH) return false;
  if (folder === "") return true;
  // Control characters, NUL and backslashes never appear in a path this app
  // produces, so their presence means the value was hand-edited or corrupted.
  for (const ch of folder) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  if (folder.includes("\\")) return false;
  if (folder.startsWith("/") || folder.endsWith("/")) return false;
  return folder.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private-mode / quota failures are not worth surfacing: the note is
    // already saved and the only loss is a remembered destination.
  }
}

export function readQuickNoteFolder(drive: string): string {
  const raw = readStorage(quickNoteDestinationKey(drive));
  if (!raw) return QUICK_NOTE_DEFAULT_FOLDER;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return QUICK_NOTE_DEFAULT_FOLDER;
    const folder = (parsed as { folder?: unknown }).folder;
    return isValidQuickNoteFolder(folder) ? folder : QUICK_NOTE_DEFAULT_FOLDER;
  } catch {
    return QUICK_NOTE_DEFAULT_FOLDER;
  }
}

/**
 * Called only after a save succeeds, so a rejected destination never
 * becomes the next default.
 */
export function writeQuickNoteFolder(drive: string, folder: string): void {
  if (!isValidQuickNoteFolder(folder)) return;
  writeStorage(quickNoteDestinationKey(drive), JSON.stringify({ folder }));
}

export function readQuickNoteLastDrive(): string | null {
  const raw = readStorage(QUICK_NOTE_LAST_DRIVE_KEY);
  return raw && raw.length > 0 ? raw : null;
}

export function writeQuickNoteLastDrive(drive: string): void {
  writeStorage(QUICK_NOTE_LAST_DRIVE_KEY, drive);
}

export interface ResolveDriveParams {
  currentDrive: string | null;
  lastDrive: string | null;
  accessibleDrives: string[];
}

/**
 * Returns `null` when several drives are accessible and neither the current
 * screen nor history points at one of them: writing a note into the wrong
 * security boundary is worse than asking for one click, so there is
 * deliberately no alphabetical fallback.
 */
export function resolveQuickNoteDrive({
  currentDrive,
  lastDrive,
  accessibleDrives,
}: ResolveDriveParams): string | null {
  if (currentDrive && accessibleDrives.includes(currentDrive)) return currentDrive;
  if (lastDrive && accessibleDrives.includes(lastDrive)) return lastDrive;
  if (accessibleDrives.length === 1) return accessibleDrives[0];
  return null;
}
