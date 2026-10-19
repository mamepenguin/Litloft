/**
 * Bundles a page holding the app's real `FilePreview`, served beside the
 * reader so that the reader frame is same-origin and under its policy.
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { join, resolve } from "node:path";

import buildFixtureCss from "../e2e-layout/build-fixture-css";

export const PREVIEW_OUT_DIR = join(__dirname, ".build-preview");

export default async function buildPreview(): Promise<void> {
  buildFixtureCss();
  await build({
    root: join(__dirname, "preview"),
    base: "/preview/",
    logLevel: "warn",
    plugins: [react()],
    resolve: {
      alias: [
        { find: /^@\/addons\/.*$/, replacement: resolve(__dirname, "..", "e2e-components", "stubs", "addon-slots.ts") },
        { find: "@", replacement: resolve(__dirname, "..", "src") },
        { find: "next/navigation", replacement: resolve(__dirname, "..", "e2e-components", "stubs", "next-navigation.ts") },
        { find: "next/dynamic", replacement: resolve(__dirname, "preview", "next-dynamic.ts") },
      ],
    },
    build: { outDir: PREVIEW_OUT_DIR, emptyOutDir: true, target: "es2020" },
  });
}
