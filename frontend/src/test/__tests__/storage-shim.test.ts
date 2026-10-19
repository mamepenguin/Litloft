import { describe, expect, it, vi } from "vitest";

/**
 * Tests intercept storage in two ways, and each is silently defeated by a
 * different implementation:
 *
 *   vi.spyOn(localStorage, "setItem")
 *   vi.spyOn(Storage.prototype, "getItem")
 *
 * jsdom's `Storage` is a Proxy whose defineProperty trap treats any string key
 * as a stored entry, so the instance spy is written into storage under the key
 * "setItem", the real method still runs, and nothing is recorded. An object
 * literal has no shared prototype, so the prototype patch lands on something
 * the instance never consults. In both cases the assertion downstream still
 * passes; it has just stopped watching.
 */
const NAMES = ["localStorage", "sessionStorage"] as const;

/**
 * Read through the descriptor rather than by indexing, so a `window`
 * accessor with side effects is never invoked just to be classified.
 */
const shimmed = (): string[] =>
  Object.getOwnPropertyNames(window)
    .filter((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(window, key);
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        descriptor.value instanceof Storage
      );
    })
    .sort();

/**
 * `describe()` first and the `push` second: recorded first, anything between
 * the two lines keeps the record and loses the block.
 */
const registered: string[] = [];

describe("test Web Storage shim", () => {
  it("covers every Web Storage global the shim installed, and no other", () => {
    expect(shimmed()).toEqual([...NAMES].sort());
    expect(registered).toEqual([...NAMES]);
  });

  for (const name of NAMES) {
    describe(name, () => {
      const storage = () => globalThis[name];

      it("dispatches through a spy installed on the instance", () => {
        const spy = vi.spyOn(storage(), "setItem");
        try {
          storage().setItem("shim-probe", "v");
          expect(spy).toHaveBeenCalledWith("shim-probe", "v");
        } finally {
          spy.mockRestore();
          storage().removeItem("shim-probe");
        }
      });

      it("does not turn an instance spy into a stored entry", () => {
        const spy = vi.spyOn(storage(), "setItem");
        try {
          // Against jsdom's Proxy this reads back the stringified mock.
          expect(storage().getItem("setItem")).toBeNull();
        } finally {
          spy.mockRestore();
        }
      });

      it("dispatches through a patch on Storage.prototype", () => {
        const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
          throw new Error("blocked");
        });
        try {
          expect(() => storage().getItem("anything")).toThrow("blocked");
        } finally {
          spy.mockRestore();
        }
      });

      it("is an instance of the global Storage", () => {
        // What makes the prototype patch above reach this object.
        expect(storage()).toBeInstanceOf(Storage);
      });
    });
    registered.push(name);
  }

  it("shares one prototype between local and session storage", () => {
    // Weaker than it looks: two object literals share
    // Object.prototype and would satisfy it too. It catches a split into two
    // classes; the prototype-dispatch cases above are what catch a retreat to
    // literals.
    expect(Object.getPrototypeOf(localStorage)).toBe(Object.getPrototypeOf(sessionStorage));
  });

  it("keeps the two backing stores separate", () => {
    localStorage.setItem("shim-isolation", "local");
    try {
      expect(sessionStorage.getItem("shim-isolation")).toBeNull();
    } finally {
      localStorage.removeItem("shim-isolation");
    }
  });
});
