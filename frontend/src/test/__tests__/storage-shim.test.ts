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
describe("test Web Storage shim", () => {
  for (const name of ["localStorage", "sessionStorage"] as const) {
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
  }

  it("shares one prototype between local and session storage", () => {
    // listSnapshot's quota test patches Storage.prototype.setItem and expects
    // it to reach sessionStorage, exactly as a browser would.
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
