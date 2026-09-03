import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

/**
 * Nothing binds its own keydown listener to test for Escape.
 *
 * A listener does not know what is stacked above it. Two of them
 * answer one press, so a picker inside a dialog closed both; a graph
 * or a player answered an Escape aimed at the modal in front of it;
 * and a "safety net in case the provider's listener order differs"
 * answered the cheat sheet's own key a second time. `ShortcutsProvider`
 * is the one place that knows the order, and `useShortcuts` is how a
 * component gets into it.
 *
 * The assertion is an empty list rather than a count, so it cannot rot
 * into a lower bound: the set this guards is meant to stay empty, and
 * a new listener names itself in the failure.
 *
 * What this does NOT flag: a React `onKeyDown` prop on an element.
 * That fires only while focus is inside it, which is a different
 * mechanism with different semantics — an inline rename field
 * cancelling on Escape is not competing with anything.
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
 * A keydown listener registration, paired with the body of the callback
 * it registers — found by name, because the two are usually written
 * lines apart (`const onKey = (e) => {…}; document.addEventListener(…)`).
 */
function escapeListeners(): string[] {
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf-8");
      const rel = relative(REPO_ROOT, file);
      if (ALLOWED.has(rel)) continue;

      for (const m of text.matchAll(
        /addEventListener\(\s*["']keydown["']\s*,\s*([A-Za-z_$][\w$]*)/g,
      )) {
        const handler = m[1];
        // The callback's body: from where it is declared to the line
        // that registers it. Inline callbacks are covered too — the
        // declaration and the registration are then the same span.
        const decl = new RegExp(
          `(?:const|let|var|function)\\s+${handler}\\b`,
        ).exec(text);
        const from = decl ? decl.index! : Math.max(0, m.index! - 800);
        const body = text.slice(from, m.index!);
        if (/\bkey\s*===\s*["']Escape["']/.test(body)) {
          found.push(`${rel}:${text.slice(0, m.index!).split("\n").length}`);
        }
      }

      // The inline form: `addEventListener("keydown", (e) => { … })`.
      for (const m of text.matchAll(
        /addEventListener\(\s*["']keydown["']\s*,\s*\(/g,
      )) {
        const tail = text.slice(m.index!, m.index! + 800);
        if (/\bkey\s*===\s*["']Escape["']/.test(tail)) {
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

  it("has a scan that can still see one", () => {
    // Guards the regexes: an assertion of "none" passes trivially once
    // the scan stops matching anything. Feed it the shape it hunts and
    // check it bites.
    const sample = `
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      };
      document.addEventListener("keydown", onKey);
    `;
    expect(
      /addEventListener\(\s*["']keydown["']\s*,\s*([A-Za-z_$][\w$]*)/.test(sample),
    ).toBe(true);
    expect(/\bkey\s*===\s*["']Escape["']/.test(sample)).toBe(true);
  });
});
