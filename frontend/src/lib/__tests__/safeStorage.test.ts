/**
 * Reading a preference must not be able to take the app down.
 *
 * A browser configured to block site data throws a `SecurityError` from
 * `localStorage.getItem` — from the call, not from touching the object
 * — and an unguarded read inside a provider's effect does not get
 * swallowed: it leaves `render()` and reaches the error boundary. Two of
 * the three providers that read preferences were doing exactly that, so
 * fixing the pre-paint script alone made the first paint correct and
 * then lost the app a moment later.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

import { readStored, writeStored } from "../safeStorage";

/** Site data blocked: the call throws, the object is there. */
function stubThrowingStorage() {
  const getItem = vi.fn(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  const setItem = vi.fn(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  vi.stubGlobal("localStorage", { getItem, setItem });
  return { getItem, setItem };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("safeStorage", () => {
  it("reads and writes normally when storage works", () => {
    writeStored("k", "v");
    expect(readStored("k")).toBe("v");
  });

  it("reads null for a key that was never written", () => {
    expect(readStored("never-written")).toBeNull();
  });

  it("answers null instead of throwing when the read is blocked", () => {
    // `null` is the same answer a first-time visitor gets, which every
    // caller already handles — so a blocked store degrades to "no
    // preference" rather than to an error boundary.
    const { getItem } = stubThrowingStorage();

    expect(() => readStored("k")).not.toThrow();
    expect(readStored("k")).toBeNull();
    expect(getItem).toHaveBeenCalled();
  });

  it("drops a blocked write instead of throwing", () => {
    const { setItem } = stubThrowingStorage();

    expect(() => writeStored("k", "v")).not.toThrow();
    expect(setItem).toHaveBeenCalled();
  });

  it("answers null where there is no storage at all", () => {
    // Server render, and any environment that simply has none.
    vi.stubGlobal("localStorage", undefined);

    expect(readStored("k")).toBeNull();
    expect(() => writeStored("k", "v")).not.toThrow();
  });
});
