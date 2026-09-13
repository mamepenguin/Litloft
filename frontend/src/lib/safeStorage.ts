/**
 * A browser configured to block site data throws a `SecurityError` from
 * the *call* — `getItem` and `setItem`, not the property access — and in
 * a component that means the error leaves `render()` and reaches the
 * error boundary.
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
