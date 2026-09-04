/**
 * The pre-paint script, run.
 *
 * It is a string injected with `dangerouslySetInnerHTML`, so nothing in
 * the app imports it as code and no type-check or render test can tell
 * whether it works. These execute it against the document the way the
 * browser does, including against a `localStorage` that throws — the
 * case that actually broke.
 *
 * That case is not exotic: a browser configured to block site data
 * throws from `getItem` itself, and an unguarded throw skipped both
 * `setAttribute` calls. It survived by luck while the CSS and the JS
 * agreed on their defaults, and stopped surviving the day
 * `data-media-layout` began defaulting to `beside` — after which the
 * page rendered the stacked form while `useMediaLayoutPreference`
 * reported beside, and the layout toggle did nothing until pressed a
 * second time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { PREFERENCE_INIT_SCRIPT } from "../preferenceInitScript";

/** Runs the script the way the injected `<script>` tag does. */
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
    window.localStorage.clear();
  });

  it("writes the defaults when nothing has been stored", () => {
    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    // Must match `normalise` in lib/mediaLayout.ts. The two disagreeing
    // is the one-frame flash this script exists to prevent.
    expect(document.documentElement.getAttribute("data-media-layout")).toBe(
      "beside",
    );
  });

  it("still writes both attributes when storage throws", () => {
    // The regression. Without a `try` around the reads, the whole script
    // dies here and neither attribute is ever set — the CSS then falls
    // back to its own defaults, which no longer match the JS ones.
    stubThrowingStorage();

    expect(() => runInitScript()).not.toThrow();

    expect(document.documentElement.getAttribute("data-media-layout")).toBe(
      "beside",
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("still honours the system theme when storage throws", () => {
    // The `try` covers the reads and nothing else, so a blocked store
    // costs the *stored* preference and not the one the OS is offering.
    // Wrapping the whole body in a catch would have lost this.
    stubThrowingStorage();
    stubMatchMedia(true);

    runInitScript();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("defaults to the same layout the module does", async () => {
    // The two defaults live in different languages — a string of ES5
    // here, TypeScript in `mediaLayout.ts` — so nothing but a test can
    // notice them drifting apart. Which makes *how* they are compared
    // the whole value of this test.
    //
    // The module has to be asked FIRST. `readMediaLayout` prefers the
    // attribute, so asking it after the script has run only asks the
    // script what it just wrote: that version passes with the two
    // defaults set to opposite values, which is precisely the drift it
    // claims to catch. Read with no attribute and no stored value and
    // it has to fall through to its own default, which is the number
    // under comparison.
    const { readMediaLayout } = await import("../mediaLayout");
    document.documentElement.removeAttribute("data-media-layout");
    window.localStorage.clear();
    const moduleDefault = readMediaLayout();

    runInitScript();
    const scriptDefault =
      document.documentElement.getAttribute("data-media-layout");

    expect(scriptDefault).toBe(moduleDefault);
  });
});
