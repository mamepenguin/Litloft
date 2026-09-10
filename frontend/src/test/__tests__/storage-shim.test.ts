import { describe, expect, it, vi } from "vitest";

/**
 * Guards the Web Storage shim installed by `src/test/setup.ts`.
 *
 * Tests across the suite intercept storage in two different ways, and each way
 * is silently defeated by a different implementation:
 *
 *   vi.spyOn(localStorage, "setItem")       - counting writes (useTreeExpansion)
 *   vi.spyOn(Storage.prototype, "getItem")  - making storage throw (nativePlayerUi,
 *                                             mediaLayout, listSnapshot)
 *
 * jsdom's `Storage` is a Proxy whose defineProperty trap treats any string key
 * as a stored entry, so the instance spy is written into storage under the key
 * "setItem", the real method still runs, and nothing is recorded. An object
 * literal has no shared prototype, so the prototype patch lands on something
 * the instance never consults. In both cases the assertion downstream still
 * passes; it has just stopped watching. Nothing fails, so nothing tells you.
 *
 * These assertions are the thing that tells you. Half of them fail against
 * jsdom's Proxy and the other half against an object literal, so neither
 * regression can land quietly.
 */
/**
 * The two Web Storage globals, declared — not counted, and not read off
 * the window.
 *
 * A length assertion here would be counting this file's own literal, and
 * the register below would be comparing that literal against itself. What
 * gives the population a second opinion is `shimmed()`: a scan of the
 * window for the objects `setup.ts` actually installed. The two disagree
 * in both directions — a name dropped from here is still on the window,
 * and a storage the shim stops replacing is still named here.
 */
const NAMES = ["localStorage", "sessionStorage"] as const;

/**
 * Every own property of `window` that holds one of the shim's instances.
 *
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
 * What the loop below registered, recorded as it registers it.
 *
 * The loop registers a whole `describe` per storage, so walking it back
 * takes four cases with it and leaves nothing behind to notice — which is
 * a state this file was measured in. `describe()` first and the `push`
 * second: recorded first, anything between the two lines keeps the record
 * and loses the block.
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
    // listSnapshot's quota test patches Storage.prototype.setItem and expects
    // it to reach sessionStorage, exactly as a browser would.
    //
    // Note this one is weaker than it looks: two object literals share
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
