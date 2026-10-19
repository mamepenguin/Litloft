const MAX_HISTORY = 20;

function historyKey(drive: string): string {
  return `search-history:${drive}`;
}

/**
 * The value is validated rather than trusted: this key can hold anything a
 * hand edit, an older schema, or another tab left behind.
 */
export function getHistory(drive: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyKey(drive));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function saveHistory(drive: string, history: string[]): void {
  try {
    localStorage.setItem(historyKey(drive), JSON.stringify(history));
  } catch {
    // Safari private mode can throw on localStorage; the history list is
    // best-effort UX, not a correctness requirement.
  }
}

export function addToHistory(drive: string, term: string): string[] {
  const normalized = term.trim();
  if (!normalized) return getHistory(drive);
  const prev = getHistory(drive).filter((h) => h !== normalized);
  const next = [normalized, ...prev].slice(0, MAX_HISTORY);
  saveHistory(drive, next);
  return next;
}

export function removeFromHistory(drive: string, term: string): string[] {
  const next = getHistory(drive).filter((h) => h !== term);
  saveHistory(drive, next);
  return next;
}
