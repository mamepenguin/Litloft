/**
 * Bundle the fixture — with the real components in it — before the run.
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
  buildFixtureCss();

  await build({
    root: FIXTURE_DIR,
    base: "./",
    logLevel: "warn",
    plugins: [react()],
    resolve: {
      // No `preserveSymlinks`: under pnpm keeping the symlink path stops a
      // dependency's own dependency from resolving (`next-intl` →
      // `use-intl`).
      // Addon slot modules are not part of the fixture: bundling them would
      // assert about whichever addon commits core points at, and they resolve
      // their packages from outside `frontend/`.
      alias: [
        { find: /^@\/addons\/.*$/, replacement: resolve(__dirname, "stubs", "addon-slots.ts") },
        { find: "@", replacement: resolve(__dirname, "..", "src") },
        { find: "next/navigation", replacement: resolve(__dirname, "stubs", "next-navigation.ts") },
      ],
    },
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      // A classic script, so the run needs no server: a `type="module"`
      // script is refused by Chrome over `file://` (CORS on a `null`
      // origin).
      rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
      modulePreload: false,
      target: "es2020",
    },
  });

  // Vite writes the entry as a module script whatever the output format.
  // `defer`, not nothing: vite puts the tag in the `<head>`, and a classic
  // script there runs before `#root` exists.
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
