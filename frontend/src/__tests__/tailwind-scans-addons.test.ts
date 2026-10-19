/**
 * Tailwind skips gitignored paths when it finds its own sources, and
 * `src/addons/*` is gitignored, so without `@source "../addons"` a class used
 * only in an addon generates no CSS in local development.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = resolve(here, "../app/globals.css");

const addons = resolve(here, "../addons");

const linked = existsSync(addons)
  ? readdirSync(addons, { withFileTypes: true }).filter(
      (e) => !e.name.startsWith("."),
    )
  : [];

describe("Tailwind's source list", () => {
  it("names the addons directory", () => {
    expect(readFileSync(globalsCss, "utf8")).toContain('@source "../addons"');
  });

  it.runIf(linked.length > 0)(
    "names a directory that actually holds the addon frontends",
    () => {
      // Tailwind does not complain about a source that matches nothing.
      expect(statSync(addons).isDirectory()).toBe(true);

      // `some`, not `every`: an addon whose frontend keeps every module in a
      // subdirectory is not evidence that `@source` points at a shell.
      const scannable = linked.some((entry) => {
        const dir = resolve(addons, entry.name);
        try {
          return readdirSync(dir).some((f) => /\.(tsx|ts|jsx|js)$/.test(f));
        } catch {
          return false;
        }
      });
      expect(scannable).toBe(true);
    },
  );
});
