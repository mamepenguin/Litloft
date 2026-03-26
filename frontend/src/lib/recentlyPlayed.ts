const STORAGE_KEY = "recently-played";
const MAX_ENTRIES = 50;

export interface RecentEntry {
  fileId: string;
  timestamp: number;
  progress?: number;
}

export function getRecentlyPlayed(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        typeof e === "object" && e !== null && typeof e.fileId === "string",
    );
  } catch {
    return [];
  }
}

function saveEntries(entries: RecentEntry[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {
    // localStorage unavailable
  }
}

export function addRecentlyPlayed(fileId: string): void {
  const entries = getRecentlyPlayed().filter((e) => e.fileId !== fileId);
  entries.unshift({ fileId, timestamp: Date.now() });
  saveEntries(entries);
}

export function getRecentFileIds(): string[] {
  return getRecentlyPlayed().map((e) => e.fileId);
}

export function getSavedProgress(fileId: string): number {
  const entry = getRecentlyPlayed().find((e) => e.fileId === fileId);
  return entry?.progress ?? 0;
}

export function saveProgress(fileId: string, time: number): void {
  const entries = getRecentlyPlayed().map((e) =>
    e.fileId === fileId ? { ...e, progress: time } : e,
  );
  saveEntries(entries);
}

export function clearProgress(fileId: string): void {
  const entries = getRecentlyPlayed().map((e) =>
    e.fileId === fileId ? { ...e, progress: undefined } : e,
  );
  saveEntries(entries);
}
