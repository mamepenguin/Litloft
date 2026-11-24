import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { PREFERENCE_INIT_SCRIPT } from "../preferenceInitScript";

function runInitScript() {
  new Function(PREFERENCE_INIT_SCRIPT)();
}

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: prefersDark })) as unknown as typeof matchMedia,
  );
}

/** A browser with site data blocked: the *call* throws, not the access. */
function stubThrowingStorage() {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
    setItem() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("the pre-paint theme script", () => {
  it("writes the theme from the stored value", () => {
    window.localStorage.setItem("theme-preference", "dark");

    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("writes the system theme when nothing has been stored", () => {
    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("still writes the theme when storage throws", () => {
    stubThrowingStorage();

    expect(() => runInitScript()).not.toThrow();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("still honours the system theme when storage throws", () => {
    stubThrowingStorage();
    stubMatchMedia(true);

    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to light when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
