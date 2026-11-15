/** An answer that hides nothing, shared so a settled failure has a stable identity. */
export const EMPTY_HIDDEN_KEYS: ReadonlySet<string> = new Set();

/**
 * Whether an entry with this key is drawn. `null` means the drive's list is
 * still loading, which draws no hideable entry.
 */
export function isEntryShown(
  key: string,
  hiddenKeys: ReadonlySet<string> | null,
): boolean {
  return hiddenKeys !== null && !hiddenKeys.has(key);
}
