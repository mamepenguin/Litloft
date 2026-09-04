import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { vi } from "vitest";
import enMessages from "../messages/en.json";

// Testing Library's 1000 ms default is a wall-clock budget, and the speed
// of the machine is not part of any test's contract: with a worker per
// core and a few hundred files, a worker can go without a core for longer
// than that, which turns a correct wait for a 300 ms debounce into a
// failure. Raising the budget hides nothing — a wait on a condition that
// is never satisfied still fails, only later. `testTimeout` in
// vitest.config.ts stays above this so the reported failure is the useful
// "unable to find" rather than a bare test timeout.
configure({ asyncUtilTimeout: 3000 });

// Web Storage is replaced wholesale with a Map-backed shim, on every
// platform and unconditionally.
//
// It began as a patch: jsdom 25 + vitest 3 + vite 6 hands back an empty `{}`
// instead of a Storage instance on some platforms, and the shim only replaced
// it when that happened. That left the suite running against two different
// storage implementations depending on the Node version, and the difference is
// not cosmetic — jsdom's `Storage` is a *Proxy* whose defineProperty trap
// treats any string key as a stored entry. `vi.spyOn(localStorage, "setItem")`
// against it does not replace the method: it writes a storage item named
// "setItem", the real method still runs, and the spy records nothing. An
// assertion that counts writes then passes vacuously wherever the shim is
// installed and fails wherever jsdom's own Storage survives.
//
// That is exactly how useTreeExpansion's "writes once" test came to pass on
// Node 25 (empty `{}` -> shim -> plain object -> spy works) and fail on the
// Node 20 that CI and frontend/Dockerfile both run (real Storage -> Proxy ->
// spy swallowed). Installing unconditionally gives every environment one
// storage object, with own, spy-able methods.
if (typeof window !== "undefined") {
  const installShim = (key: "localStorage" | "sessionStorage") => {
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
