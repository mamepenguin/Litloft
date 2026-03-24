const STORAGE_KEY = "recently-played";
const MAX_ENTRIES = 50;

export interface RecentEntry {
  fileId: number;
  timestamp: number;
}

export function getRecentlyPlayed(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        typeof e === "object" && e !== null && typeof e.fileId === "number",
    );
  } catch {
    return [];
  }
}

export function addRecentlyPlayed(fileId: number): void {
  try {
    const entries = getRecentlyPlayed().filter((e) => e.fileId !== fileId);
    entries.unshift({ fileId, timestamp: Date.now() });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {
    // localStorage unavailable
  }
}

export function getRecentFileIds(): number[] {
  return getRecentlyPlayed().map((e) => e.fileId);
}
