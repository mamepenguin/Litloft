/**
 * Bundle the fixture — with the real components in it — before the run.
 *
 * ## Why this target exists at all
 *
 * `e2e-layout/` opens a static page off `file://` with the app's compiled
 * stylesheet. It cannot import a `.tsx`, so nothing in it ever runs a
 * component: its own docstring says "Nothing here runs `DismissScrim`".
 * That is not a small gap. **Every functional defect this unit shipped in
 * rounds 3, 4, 5 and 6 passed the browser suite**, because the only thing
 * the browser suite could see was a hand-written copy of the mechanism —
 * and a copy is right by construction.
 *
 * So: the repo's own vite compiles `fixtures/app.tsx`, which imports
 * `src/components/DismissScrim.tsx`, `src/components/ContextMenu.tsx` and
 * `src/hooks/useContextMenu.ts` unmodified. Break the primitive and this
 * run goes red.
 *
 * ## What it holds that `e2e-layout` cannot
 *
 * - **The component, not a copy.** The dispatch path is React's own:
 *   handlers delegated at the root container, under a swallow that stops
 *   the click at `document` above it.
 * - **Gestures a browser synthesises**, including one no `page.touchscreen`
 *   API can express — a *long press*, sent as CDP `Input.dispatchTouchEvent`
 *   touchStart, a wait, touchEnd, with the compatibility `click` produced
 *   by Chromium rather than by the test.
 *
 * ## What it still cannot hold
 *
 * The *pages* are hand-written. `SelectionBar`, `InspectorShell` and
 * `FileCard` need Next.js, `next-intl` and a backend, so what is measured
 * is the real primitive inside a copy of their arrangements — the tier,
 * the stacking context, the transform, the opener. A regression in one of
 * those components' own markup is `e2e/`'s subject, and `e2e/` is not in
 * CI (docs/developer-guide/testing.md).
 *
 * Chromium only, like `e2e-layout`. Safari's touch-to-click synthesis is
 * the thing this most wants a second engine for.
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import buildFixtureCss from "../e2e-layout/build-fixture-css";

export const FIXTURE_DIR = join(__dirname, "fixtures");
export const OUT_DIR = join(__dirname, ".build");
export const PAGE = join(OUT_DIR, "index.html");

export default async function buildComponentFixture(): Promise<void> {
  // The same sheet `e2e-layout` measures, built by the same function, so a
  // class here means what it means in the app. `app.tsx` imports it, and
  // vite bundles it into the page's own stylesheet.
  buildFixtureCss();

  await build({
    root: FIXTURE_DIR,
    base: "./",
    logLevel: "warn",
    plugins: [react()],
    resolve: {
      // No `preserveSymlinks`, unlike `vitest.config.ts`: nothing here
      // imports an addon through `src/addons/*`, and under pnpm keeping
      // the symlink path stops a dependency's own dependency from
      // resolving (`next-intl` → `use-intl`, reached from `ContextMenu`
      // through `useShortcuts`).
      alias: { "@": resolve(__dirname, "..", "src") },
    },
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      // One page, one script, no code splitting — so the emitted tag can
      // be a classic script and the run needs no server. A `type="module"`
      // script is refused by Chrome over `file://` (CORS on a `null`
      // origin), and starting a server for one static page would be the
      // only thing in either browser target that could fail to start.
      rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
      modulePreload: false,
      target: "es2020",
    },
  });

  // Vite writes the entry as a module script whatever the output format,
  // so the tag is rewritten here rather than in a plugin: it is two
  // attributes, and a plugin would be a second thing to keep true.
  //
  // `defer`, not nothing: vite puts the tag in the `<head>`, and a classic
  // script there runs before `#root` exists. Measured — `createRoot` threw
  // React #299 and every case waited on a body that never became ready.
  const html = readFileSync(PAGE, "utf8");
  const classic = html
    .replace(/\s+type="module"/g, " defer")
    .replace(/\s+crossorigin/g, "");
  if (classic === html) {
    throw new Error(
      `${PAGE} has no module script to rewrite — vite's html output changed ` +
        `shape, and the page would load nothing while every case here waits ` +
        `for a body that never becomes ready.`,
    );
  }
  writeFileSync(PAGE, classic);
}
