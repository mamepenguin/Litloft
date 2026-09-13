import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import enMessages from "../messages/en.json";

// Testing Library's 1000 ms default is a wall-clock budget that a starved
// worker can exceed on a correct wait. `testTimeout` in vitest.config.ts must
// stay above this so the failure reads "unable to find" rather than a timeout.
configure({ asyncUtilTimeout: 3000 });

// Web Storage is replaced unconditionally with a class-based shim so that both
// `vi.spyOn(localStorage, "setItem")` and `vi.spyOn(Storage.prototype, ...)`
// intercept. Against jsdom's Proxy-based `Storage` the first silently writes
// an item named "setItem"; against an object literal the second patches
// nothing the instance consults.
if (typeof window !== "undefined") {
  class TestStorage {
    private store = new Map<string, string>();

    get length(): number {
      return this.store.size;
    }
    clear(): void {
      this.store.clear();
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? this.store.get(key)! : null;
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null;
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value));
    }
  }

  const define = (target: object, key: string, value: unknown) => {
    Object.defineProperty(target, key, { value, writable: true, configurable: true });
  };

  // One class for both, as in a browser: a patch on Storage.prototype has to
  // reach sessionStorage too.
  define(window, "Storage", TestStorage);
  define(globalThis, "Storage", TestStorage);

  for (const key of ["localStorage", "sessionStorage"] as const) {
    const shim = new TestStorage() as unknown as Storage;
    define(window, key, shim);
    define(globalThis, key, shim);
  }
}

// @testing-library/dom's waitFor() detects fake timers via `typeof jest`;
// without the alias it polls with a faked setInterval and hangs under
// vi.useFakeTimers().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest = vi;

type MessageTree = { [key: string]: string | MessageTree };

function lookup(tree: MessageTree, path: string): unknown {
  let current: unknown = tree;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

vi.mock("next-intl", () => {
  const messages = enMessages as unknown as MessageTree;

  // `namespace` is optional in the real `next-intl`: `useTranslations()`
  // resolves a whole path from the root.
  const useTranslations = (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const path = namespace === undefined ? key : `${namespace}.${key}`;
      const raw = lookup(messages, path);
      let text = typeof raw === "string" ? raw : path;
      if (values) {
        text = Object.entries(values).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, String(v)),
          text,
        );
      }
      return text;
    };
    return t;
  };

  const useLocale = () => "en";

  return {
    useTranslations,
    useLocale,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// End whatever gesture the test left open: `DismissScrim` keeps a press in
// flight and an armed swallow in module scope, and a test that fires only
// `pointerdown` leaks both into the next test in the file. `pointercancel`
// is the one event that both ends the press and abandons the swallow.
//
// It is not bubbling, so a `window` bubble listener never sees it. It runs
// before Testing Library's `cleanup()`, on a still-mounted tree, so a
// component that ends a drag on a document-level `pointercancel` will run its
// handler outside `act()`.
afterEach(() => {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new Event("pointercancel"));
  }
});
