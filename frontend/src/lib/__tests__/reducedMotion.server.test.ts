// @vitest-environment node
/**
 * SPEC-CORE-179 I9 — with no `window` (server render) the answer is "not reduced".
 */

import { describe, expect, it } from "vitest";

import { prefersReducedMotion, scrollBehavior } from "../reducedMotion";

describe("SPEC-CORE-179 I9 without window", () => {
  it("SPEC-CORE-179 I9 answers not reduced and a smooth scroll without throwing", () => {
    expect(typeof window).toBe("undefined");
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });
});
