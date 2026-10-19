const KEY_PREFIX = "litloft:recent-tags:";
const MAX_RECENT = 20;

function storageKey(drive: string): string {
  return `${KEY_PREFIX}${drive}`;
}

/**
 * Reading `window.localStorage` can throw on the property access itself
 * when site data is blocked, so the lookup belongs inside the try along
 * with the parse.
 */
export function readRecentTags(drive: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(drive));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

/**
 * Never throws: a tag add must still land when the write is refused
 * (private window, blocked site data, quota).
 */
export function recordRecentTag(drive: string, tag: string): void {
  try {
    const lower = tag.toLowerCase();
    const next = [
      tag,
      ...readRecentTags(drive).filter((entry) => entry.toLowerCase() !== lower),
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(storageKey(drive), JSON.stringify(next));
  } catch {
    // Recency is a convenience; losing it must not affect the tag write.
  }
}
