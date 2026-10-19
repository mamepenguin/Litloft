import { describe, it, expect } from "vitest";
import {
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

/**
 * A listener does not know what is stacked above it. `ShortcutsProvider`
 * is the one place that knows the order, and `useShortcuts` is how a
 * component gets into it.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

/**
 * The provider itself binds the one listener and answers Escape for
 * the cheat sheet before consulting the stack. That is the mechanism,
 * not a bypass of it.
 */
const ALLOWED = new Set(["frontend/src/components/ShortcutsProvider.tsx"]);

const ROOTS = [
  resolve(REPO_ROOT, "frontend/src"),
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => resolve(ADDONS_DIR, e.name, "frontend"))
        .filter(existsSync)
    : []),
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue;
      if (full.startsWith(ADDON_LINK_DIR)) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * Any mention of the key at all, not `=== "Escape"`: `!==`, a `switch` or
 * an `includes([...])` compare it just as well.
 */
const MENTIONS_ESCAPE = /["'`]Escape["'`]|keyCode\s*===?\s*27/;

/**
 * A keydown listener registration, paired with the body of the callback
 * it registers — found by name, because the two are usually written
 * lines apart (`const onKey = (e) => {…}; document.addEventListener(…)`).
 */
function escapeListeners(roots: string[] = ROOTS): string[] {
  const found: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf-8");
      const rel = relative(REPO_ROOT, file);
      if (ALLOWED.has(rel)) continue;

      for (const m of text.matchAll(
        /addEventListener\(\s*["']keydown["']\s*,\s*([A-Za-z_$][\w$]*)/g,
      )) {
        const handler = m[1];
        // A named handler is usually declared above its registration and
        // occasionally below it (function declarations hoist), so the span
        // is taken between the two in whichever order they appear.
        const decl = new RegExp(
          `(?:const|let|var|function)\\s+${handler}\\b`,
        ).exec(text);
        const from = decl ? decl.index! : Math.max(0, m.index! - 800);
        const body = text.slice(
          Math.min(from, m.index!),
          Math.max(from, m.index!) + 800,
        );
        if (MENTIONS_ESCAPE.test(body)) {
          found.push(`${rel}:${text.slice(0, m.index!).split("\n").length}`);
        }
      }

      // The inline form: `addEventListener("keydown", (e) => { … })`.
      for (const m of text.matchAll(
        /addEventListener\(\s*["']keydown["']\s*,\s*\(/g,
      )) {
        const tail = text.slice(m.index!, m.index! + 800);
        if (MENTIONS_ESCAPE.test(tail)) {
          found.push(`${rel}:${text.slice(0, m.index!).split("\n").length}`);
        }
      }
    }
  }
  return [...new Set(found)].sort();
}

describe("Escape", () => {
  it("is never claimed by a listener of its own", () => {
    expect(escapeListeners()).toEqual([]);
  });

  it("looks at every repository it claims to", () => {
    // A clone without `--recurse-submodules` leaves `addons/*` empty, and
    // the scan quietly covers core alone.
    expect(ROOTS.map((r) => relative(REPO_ROOT, r)).sort()).toEqual([
      "addons/cloud-sync/frontend",
      "addons/intelligence/frontend",
      "addons/knowledge/frontend",
      "addons/media_import/frontend",
      "frontend/src",
    ]);
  });

  it("still bites when the pattern comes back", () => {
    const dir = mkdtempSync(join(tmpdir(), "escape-scan-"));
    const file = join(dir, "Sample.tsx");
    writeFileSync(
      file,
      [
        "const onKey = (e: KeyboardEvent) => {",
        '  if (e.key !== "Escape") return;',
        "  close();",
        "};",
        'document.addEventListener("keydown", onKey);',
      ].join("\n"),
    );
    try {
      expect(escapeListeners([dir])).toEqual([`${relative(REPO_ROOT, file)}:5`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
