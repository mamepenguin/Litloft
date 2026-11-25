/**
 * SPEC-CORE-179 I9 — the shared reduced-motion answer.
 */

import { afterEach, describe, expect, it } from "vitest";

import { prefersReducedMotion, scrollBehavior } from "../reducedMotion";

const original = Object.getOwnPropertyDescriptor(window, "matchMedia");

let reduced = false;
const queries: string[] = [];

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      queries.push(query);
      return {
        matches: reduced && query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
}

function removeMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

afterEach(() => {
  reduced = false;
  queries.length = 0;
  if (original) Object.defineProperty(window, "matchMedia", original);
  else delete (window as Partial<Window>).matchMedia;
});

describe("SPEC-CORE-179 I9 prefersReducedMotion", () => {
  it("SPEC-CORE-179 I9 answers the reduce query's current matches", () => {
    installMatchMedia();
    reduced = true;
    expect(prefersReducedMotion()).toBe(true);
    expect(queries).toContain("(prefers-reduced-motion: reduce)");
  });

  it("SPEC-CORE-179 I9 follows a change of the OS setting on the next call, without a reload", () => {
    installMatchMedia();
    reduced = true;
    expect(prefersReducedMotion()).toBe(true);
    reduced = false;
    expect(prefersReducedMotion()).toBe(false);
    reduced = true;
    expect(prefersReducedMotion()).toBe(true);
  });

  it("SPEC-CORE-179 I9 answers not reduced when window.matchMedia is missing", () => {
    removeMatchMedia();
    expect(() => prefersReducedMotion()).not.toThrow();
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("SPEC-CORE-179 scrollBehavior", () => {
  it("SPEC-CORE-179 is a jump under reduced motion and a glide without it, read on every call", () => {
    installMatchMedia();
    reduced = true;
    expect(scrollBehavior()).toBe("auto");
    reduced = false;
    expect(scrollBehavior()).toBe("smooth");
  });

  it("SPEC-CORE-179 glides when window.matchMedia is missing", () => {
    removeMatchMedia();
    expect(scrollBehavior()).toBe("smooth");
  });
});
