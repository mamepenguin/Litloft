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
  document.documentElement.removeAttribute("data-media-layout");
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-media-layout");
});

describe("the pre-paint preference script", () => {
  it("writes both attributes from stored values", () => {
    window.localStorage.setItem("theme-preference", "dark");
    window.localStorage.setItem("media-layout-preference", "stacked");

    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-media-layout")).toBe(
      "stacked",
    );
  });

  it("writes the defaults when nothing has been stored", () => {
    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-media-layout")).toBe(
      "beside",
    );
  });

  it("still writes both attributes when storage throws", () => {
    stubThrowingStorage();

    expect(() => runInitScript()).not.toThrow();

    expect(document.documentElement.getAttribute("data-media-layout")).toBe(
      "beside",
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("still honours the system theme when storage throws", () => {
    stubThrowingStorage();
    stubMatchMedia(true);

    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("writes the layout even when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.getAttribute("data-media-layout")).toBe(
      "beside",
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("defaults to the same layout the module does", async () => {
    // The module has to be asked FIRST: `readMediaLayout` prefers the
    // attribute, so asking it after the script has run only asks the
    // script what it just wrote.
    const { readMediaLayout } = await import("../mediaLayout");
    document.documentElement.removeAttribute("data-media-layout");
    const moduleDefault = readMediaLayout();

    runInitScript();
    const scriptDefault =
      document.documentElement.getAttribute("data-media-layout");

    expect(scriptDefault).toBe(moduleDefault);
  });
});
