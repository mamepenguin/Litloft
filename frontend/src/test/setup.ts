import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import enMessages from "../messages/en.json";

// jsdom 25 + vitest 3 + vite 6 ships an empty `{}` for localStorage on
// some platforms instead of a Storage instance. Replace it with a tiny
// Map-backed shim so tests can exercise persistence code paths.
if (typeof window !== "undefined") {
  const installShim = (key: "localStorage" | "sessionStorage") => {
    const target = (window as unknown as Record<string, unknown>)[key];
    if (target && typeof (target as Storage).getItem === "function") return;
    const store = new Map<string, string>();
    const shim: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k) => (store.has(k) ? store.get(k)! : null),
      key: (i) => Array.from(store.keys())[i] ?? null,
      removeItem: (k) => {
        store.delete(k);
      },
      setItem: (k, v) => {
        store.set(k, String(v));
      },
    };
    Object.defineProperty(window, key, { value: shim, writable: false, configurable: true });
    Object.defineProperty(globalThis, key, { value: shim, writable: false, configurable: true });
  };
  installShim("localStorage");
  installShim("sessionStorage");
}

// @testing-library/dom's waitFor() detects fake timers by checking
// `typeof jest !== 'undefined'`. Without that, it falls back to
// real-timer polling via setInterval — which vitest's vi.useFakeTimers()
// has globally faked, so the polling never fires and waitFor hangs even
// when its first synchronous check would pass. Aliasing `jest` to `vi`
// makes testing-library use its jest-fake-timers branch, which advances
// the fake clock between polls. See
// https://github.com/testing-library/dom-testing-library/blob/main/src/wait-for.ts
// (`jestFakeTimersAreEnabled`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest = vi;

// Messages may be arbitrarily nested (e.g. "knowledge.editor.toolbar.h1").
// Walk dot-separated namespace + key paths against the full tree instead
// of indexing a single level.
type MessageTree = { [key: string]: string | MessageTree };

function lookup(tree: MessageTree, path: string): unknown {
  let current: unknown = tree;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Global mock for next-intl
// Returns actual English translations so tests run in English locale
vi.mock("next-intl", () => {
  const messages = enMessages as unknown as MessageTree;

  const useTranslations = (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const raw = lookup(messages, `${namespace}.${key}`);
      let text = typeof raw === "string" ? raw : `${namespace}.${key}`;
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
