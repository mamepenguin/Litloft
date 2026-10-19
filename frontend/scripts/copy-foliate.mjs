import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const src = dirname(require.resolve("foliate-js/view.js"));
const dest = join(import.meta.dirname, "..", "public", "epub-reader", "vendor");

// Only what view.js reaches for a reflowable EPUB. fixed-layout.js imports a
// bare specifier that cannot resolve without an import map, and the reader
// refuses fixed-layout books before view.open would load it.
const FILES = [
  "view.js",
  "epub.js",
  "epubcfi.js",
  "paginator.js",
  "progress.js",
  "overlayer.js",
  "text-walker.js",
  "vendor/zip.js",
  "LICENSE",
];

rmSync(dest, { recursive: true, force: true });
for (const file of FILES) {
  mkdirSync(dirname(join(dest, file)), { recursive: true });
  cpSync(join(src, file), join(dest, file));
}
