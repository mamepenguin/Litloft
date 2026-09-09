import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";
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

// Web Storage is replaced wholesale with a Map-backed shim, on every platform
// and unconditionally, and `Storage` is repointed at the shim's class.
//
// It began as a patch: jsdom 25 + vitest 3 + vite 6 hands back an empty `{}`
// instead of a Storage instance on some platforms, and the shim only replaced
// it when that happened. That left the suite running against two different
// storage implementations depending on the Node version, and the difference is
// not cosmetic. Two independent mechanisms have to keep working, and each one
// breaks against a different implementation:
//
//   vi.spyOn(localStorage, "setItem")        - useTreeExpansion counts writes
//   vi.spyOn(Storage.prototype, "getItem")   - three lib tests make storage throw
//
// jsdom's `Storage` is a Proxy whose defineProperty trap treats any string key
// as a stored entry, so the first writes a storage item named "setItem", leaves
// the real method in place, and records nothing. An object literal has no
// shared prototype, so the second patches something the instance never
// consults. Either way the assertion still passes — it has simply stopped
// watching anything.
//
// A class gives both a place to land: methods live on a prototype the
// instances share, and a spy on an instance defines an own property that
// shadows it. `globalThis.Storage` is repointed so `Storage.prototype` names
// that prototype. src/test/__tests__/storage-shim.test.ts asserts both
// directions still intercept.
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
  // reach sessionStorage too (listSnapshot's quota test relies on that).
  define(window, "Storage", TestStorage);
  define(globalThis, "Storage", TestStorage);

  for (const key of ["localStorage", "sessionStorage"] as const) {
    const shim = new TestStorage() as unknown as Storage;
    define(window, key, shim);
    define(globalThis, key, shim);
  }
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

  // `namespace` is optional in the real `next-intl`: `useTranslations()`
  // resolves a whole path from the root, which is how core reaches an
  // addon's own catalogue (`AddonSlot`, `ShellLayout`, the addon-policy
  // legend). Glueing `undefined.` on the front made every one of those
  // an unresolvable miss under jsdom, so no test could assert on the
  // words an addon supplies — only on the identifier the miss produced.
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

// End whatever gesture the test left open.
//
// `DismissScrim` keeps two pieces of module-scope state across a file: a
// press is in flight from `pointerdown` until `pointerup` or
// `pointercancel` (a popup that mounts during one — `useContextMenu`'s
// long press — has to take the click that press will produce), and an
// armed swallow waits for the click a press produced. A test that fires
// only the down half leaves both behind, and the next test in the same
// file pays: a popup mounted then arms a swallow for a press that ended
// before it, and a `fireEvent.click` can be eaten outright by a swallow
// armed a test ago.
//
// Both were reachable. The press half was found by the shuffled-order job
// — the click-away case in `FolderContent.inlineRename.test.tsx` presses
// `document.body` and never lifts, and the two tests it shares a file with
// lost the click that opens the inline editor when the shuffle put them
// after it. Module state does not cross files here (`pool: "forks"`, and
// isolation on), so this is a within-file ordering, which is the half of
// `--sequence.shuffle` `ci.yml` says has found every defect so far. The
// swallow half was found in review, by the same shape one field over.
//
// `pointercancel` rather than `pointerup`, because it is the one event
// that means both: it ends the press *and* it is in the set that abandons
// an armed swallow. A browser sends it when a gesture stops being one, and
// a test ending is that.
//
// **What this is, exactly.** A plain `Event`, not a `PointerEvent` — jsdom
// implements none — dispatched at `document` and not bubbling. So it
// reaches a `pointercancel` listener on `document` in either phase, and a
// *capture* listener on `window`, because the capture path runs through
// it; a bubble listener on `window` never sees it, and a handler that
// reads `button` or `pointerId` off it gets `undefined`.
//
// That is deliberately the smallest thing that ends the gesture this
// harness knows about, which is the one `DismissScrim` installs on
// `document` in the capture phase. Making it bubble would also end the
// scrub `usePlayerGestures` follows on a `window` bubble listener —
// measured, and it costs act warnings from a component that is still
// mounted when this runs (see the ordering below). A window-level gesture that leaks the same way
// needs its own lift, or this event needs to grow, and either way the
// scopes it reaches are pinned in `press-lift.test.tsx` rather than
// described here alone.
//
// It runs **before** Testing Library's `cleanup()`: vitest calls
// `afterEach` hooks in reverse registration order and the auto-cleanup is
// registered by the import at the top of this file. So the event lands on
// a still-mounted tree. That is harmless while nothing but `DismissScrim`
// answers a document-level `pointercancel` — but a component that ends a
// drag on one will run its drag-end handler during teardown, outside
// `act()`, and the act warning will name a file whose author changed
// nothing.
afterEach(() => {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new Event("pointercancel"));
  }
});
