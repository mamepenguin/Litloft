import { describe, expect, it, vi } from "vitest";

/**
 * Guards the Web Storage shim installed by `src/test/setup.ts`.
 *
 * These assertions look tautological. They are not: every one of them fails
 * against jsdom's own `Storage`, which is a Proxy whose defineProperty trap
 * treats any string key as a stored entry. `vi.spyOn(localStorage, "setItem")`
 * against that object stores the mock *as a storage item named "setItem"*,
 * leaves the real method in place, and records nothing — so a test that counts
 * writes passes while observing none.
 *
 * The shim used to be installed only where jsdom handed back an empty `{}`
 * instead of a Storage instance, which depends on the Node version. The suite
 * therefore ran against two different storage objects, and `useTreeExpansion`'s
 * "writes once" test passed on Node 25 and failed on the Node 20 that CI and
 * frontend/Dockerfile both run.
 *
 * If anyone makes the shim conditional again, this file fails immediately
 * rather than letting a spy-based assertion elsewhere go quietly vacuous.
 */
describe("test Web Storage shim", () => {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    describe(name, () => {
      const storage = () => globalThis[name];

      it("owns its methods rather than inheriting them from a Proxy", () => {
        const descriptor = Object.getOwnPropertyDescriptor(storage(), "setItem");
        expect(descriptor).toBeDefined();
        expect(typeof descriptor?.value).toBe("function");
      });

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

      it("does not turn the spy into a stored entry", () => {
        const spy = vi.spyOn(storage(), "setItem");
        try {
          // Against jsdom's Proxy this reads back the stringified mock.
          expect(storage().getItem("setItem")).toBeNull();
        } finally {
          spy.mockRestore();
        }
      });
    });
  }
});
