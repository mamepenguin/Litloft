export const SPREAD_MODE_KEY = "image-viewer:spread-mode";

export const LEGACY_SPLIT_MODE_KEY = "image-viewer:split-mode";

/**
 * The old key is consumed rather than left behind: leaving it would make
 * a later "off" silently revert on the next read.
 */
export function readSpreadMode(fallback = false): boolean {
  let legacy: string | null = null;
  try {
    const current = localStorage.getItem(SPREAD_MODE_KEY);
    if (current === "true") return true;
    if (current === "false") return false;
    legacy = localStorage.getItem(LEGACY_SPLIT_MODE_KEY);
  } catch {
    return fallback;
  }

  if (legacy !== "true" && legacy !== "false") return fallback;

  // The answer is decided before anything is written: Safari in private
  // browsing reads and refuses to write.
  try {
    localStorage.setItem(SPREAD_MODE_KEY, legacy);
    localStorage.removeItem(LEGACY_SPLIT_MODE_KEY);
  } catch {
    // Carried for this session; asked again on the next.
  }
  return legacy === "true";
}

export function writeSpreadMode(value: boolean): void {
  try {
    localStorage.setItem(SPREAD_MODE_KEY, String(value));
  } catch {
    // A viewer that cannot remember the choice still has to open.
  }
}
