/**
 * Where the reader's spread choice is stored, and how the old key is
 * carried over.
 *
 * The setting used to be called `split-mode`, after the one thing it
 * did: cutting a wide scan in half. It now also puts two tall pages side
 * by side, so the name says the reading it produces rather than the
 * operation. A reader who had it on should not have to turn it on again.
 */
export const SPREAD_MODE_KEY = "image-viewer:spread-mode";

/** Read once, then removed. Nothing writes it any more. */
export const LEGACY_SPLIT_MODE_KEY = "image-viewer:split-mode";

/**
 * The stored choice, migrating the old key on the way past.
 *
 * The old key is consumed rather than left behind: leaving it would make
 * a later "off" silently revert on the next read, since it is the one
 * that used to win.
 */
export function readSpreadMode(fallback = false): boolean {
  try {
    const current = localStorage.getItem(SPREAD_MODE_KEY);
    if (current === "true") return true;
    if (current === "false") return false;

    const legacy = localStorage.getItem(LEGACY_SPLIT_MODE_KEY);
    if (legacy === "true" || legacy === "false") {
      localStorage.setItem(SPREAD_MODE_KEY, legacy);
      localStorage.removeItem(LEGACY_SPLIT_MODE_KEY);
      return legacy === "true";
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeSpreadMode(value: boolean): void {
  try {
    localStorage.setItem(SPREAD_MODE_KEY, String(value));
  } catch {
    // A viewer that cannot remember the choice still has to open.
  }
}
