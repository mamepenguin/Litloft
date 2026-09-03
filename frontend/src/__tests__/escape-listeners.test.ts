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
 * That is a different mechanism — it fires only while focus is inside
 * the element, and the component that owns the focus is usually the one
 * that should answer. It is not a blanket exemption: such a handler
 * that does not `stopPropagation` still reaches `document`, so its key
 * can be answered twice. Several in this codebase are in that position
 * (`SettingsSheet`, `CommentSection`, `EditableTagChips`, …). Deciding
 * which of those own their press is a separate change; this guard is
 * about the listeners that compete with the stack by construction.
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
 * Any mention of the key at all, not `=== "Escape"`.
 *
 * The first version of this asked for `===` and reported an empty list
 * over two live counter-examples, because both wrote
 * `if (e.key !== "Escape") return;`. The other shapes it would equally
 * have missed — `e.code`, `keyCode === 27`, a `switch`, an
 * `includes([...])`, a lower-cased compare — are the reason the test is
 * for the string rather than for one way of comparing it. A listener
 * that mentions Escape and does not act on it is not a shape that
 * exists here, and would be cheap to allowlist if it appeared.
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
        // The callback's body. A named handler is usually declared
        // above its registration and occasionally below it (function
        // declarations hoist), so the span is taken between the two in
        // whichever order they appear — an unclamped `slice` returns ""
        // for the second case and the body test can never match.
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
    // A clone without `--recurse-submodules` leaves `addons/*` empty,
    // every addon root fails `existsSync`, and the scan quietly covers
    // core alone — while still reporting green. A scan that narrows its
    // own scope in silence is the exact failure this guard exists to
    // prevent, so the roots are counted.
    expect(ROOTS.map((r) => relative(REPO_ROOT, r)).sort()).toEqual([
      "addons/cloud-sync/frontend",
      "addons/intelligence/frontend",
      "addons/knowledge/frontend",
      "addons/media_import/frontend",
      "frontend/src",
    ]);
  });

  it("still bites when the pattern comes back", () => {
    // Guards the scan end to end rather than re-testing its regexes: an
    // assertion of "none" passes trivially once the walk stops
    // returning files. This writes the shape into the tree, runs the
    // real `escapeListeners()`, and checks it is named.
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
