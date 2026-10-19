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
