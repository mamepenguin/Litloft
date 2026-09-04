/**
 * `localStorage`, for code that must not die when it is unavailable.
 *
 * A browser configured to block site data throws a `SecurityError` from
 * the *call* — `getItem` and `setItem`, not the property access — and in
 * a component that means the error leaves `render()` and reaches the
 * error boundary. The app is then gone, over a preference.
 *
 * Every read gives back `null` there, which every caller already has to
 * handle: it is the same answer a first-time visitor gets. Every write
 * is dropped, which is what "site data is blocked" means. Neither is a
 * failure worth telling anyone about, so neither logs.
 *
 * Storage that *does* work is untouched by this — no caching, no
 * shimming, no in-memory fallback pretending a preference was kept.
 */
export function readStored(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // Blocked, or over quota. The preference does not survive the tab;
    // nothing else about the page changes.
  }
}
