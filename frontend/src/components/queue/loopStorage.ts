const LOOP_KEY = "collection-loop";
const LEGACY_LOOP_KEY = "playlist-loop";

export function getStoredLoop(): boolean | null {
  try {
    const v = localStorage.getItem(LOOP_KEY);
    if (v !== null) return v === "1";
    // One-time migration from the legacy key.
    const legacy = localStorage.getItem(LEGACY_LOOP_KEY);
    if (legacy !== null) {
      localStorage.setItem(LOOP_KEY, legacy);
      localStorage.removeItem(LEGACY_LOOP_KEY);
      return legacy === "1";
    }
    return null;
  } catch {
    return null;
  }
}

export function getLoop(): boolean {
  return getStoredLoop() ?? false;
}

export function setLoopStorage(v: boolean): void {
  try {
    localStorage.setItem(LOOP_KEY, v ? "1" : "0");
  } catch {
    // localStorage unavailable
  }
}
