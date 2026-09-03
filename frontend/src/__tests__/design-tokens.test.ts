import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

// Tailwind v4 emits no rule at all for a color utility whose token is not
// declared in `@theme inline`. The class stays in the DOM, nothing warns, and
// the element simply renders without the colour — which is how nine dead
// tokens survived across twenty-five call sites (UI redesign Bug-1).
//
// This walks the same ground the bug did: every colour token the theme
// declares, against every colour utility the source actually writes.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GLOBALS_CSS = resolve(REPO_ROOT, "frontend/src/app/globals.css");

/** Colour utilities are `<property>-<token>`; these are the properties in use. */
const PROPERTIES = [
  "text",
  "bg",
  "border",
  "ring",
  "outline",
  "fill",
  "stroke",
  "from",
  "to",
  "via",
] as const;

/**
 * Core plus every addon checked out beside it.
 *
 * `frontend/src/addons/*` are symlinks into these same trees — an addon is
 * enabled by linking it — so that directory is skipped during the walk and the
 * submodules are read at the root instead. Reading the root rather than the
 * links means the sweep covers an addon that is present but not enabled, which
 * is the state a submodule sits in right after a pointer bump.
 */
const SOURCE_ROOTS = [
  "frontend/src",
  ...readdirSync(resolve(REPO_ROOT, "addons"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `addons/${e.name}/frontend`),
];

function declaredTokens(): Set<string> {
  const css = readFileSync(GLOBALS_CSS, "utf-8");
  const theme = css.match(/@theme inline\s*\{([\s\S]*?)\n\}/);
  if (!theme) throw new Error("globals.css has no `@theme inline` block");
  return new Set(
    [...theme[1].matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
}

/**
 * The first segment of each declared token — `bg`, `text`, `accent`, `warm`…
 *
 * A utility is only judged when its token starts with one of these. That is
 * what keeps `text-sm`, `bg-black/70` and `bg-gradient-to-b` out of the
 * results: `sm`, `black` and `gradient` name no token family, so they are
 * Tailwind's business, not ours. The cost is that a wholly invented family
 * (`bg-surface-2`) goes unseen; every token this project has ever declared or
 * mistakenly used has fallen inside an existing family.
 */
function declaredFamilies(tokens: Set<string>): Set<string> {
  return new Set([...tokens].map((t) => t.split("-")[0]));
}

const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

// This file spells out the patterns it forbids in order to explain them, so it
// is the one file the line scans below must not read.
const SELF = fileURLToPath(import.meta.url);

function sourceFiles(root: string): string[] {
  const abs = resolve(REPO_ROOT, root);
  // An uninitialised submodule leaves an empty directory behind.
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      // A link to an addon that is not checked out here dangles; statSync throws on it.
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

interface Use {
  token: string;
  utility: string;
  where: string;
}

function collectUses(): Use[] {
  const pattern = new RegExp(
    String.raw`\b(${PROPERTIES.join("|")})-([a-z][a-z0-9-]*)`,
    "g",
  );
  const uses: Use[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(pattern)) {
          uses.push({
            token: m[2],
            utility: m[0],
            where: `${relative(REPO_ROOT, file)}:${i + 1}`,
          });
        }
      });
    }
  }
  return uses;
}

describe("design token declarations match their use", () => {
  const tokens = declaredTokens();
  const families = declaredFamilies(tokens);
  const uses = collectUses();

  it("reads the token table out of globals.css", () => {
    expect(tokens.size).toBeGreaterThan(20);
    expect(tokens).toContain("text-muted");
    expect(tokens).toContain("bg-card");
  });

  it("every colour utility resolves to a declared token", () => {
    const undeclared = uses.filter(
      (u) => families.has(u.token.split("-")[0]) && !tokens.has(u.token),
    );
    const report = [...new Set(undeclared.map((u) => `${u.utility}  ${u.where}`))].sort();
    expect(report).toEqual([]);
  });

  // DESIGN.md §6 "Disabled (every variant)": a disabled control drops its
  // enabled background rather than fading it. `disabled:opacity-50` on an
  // accent button leaves it reading as the page's one call to action, only
  // dimmer, so it still invites the press it will not accept (SET-1).
  //
  // Scoped to accent buttons, which is where the contradiction bites. The
  // remaining `disabled:opacity-*` uses are folded in with the shared Button
  // component (Phase 3), and this widens to all of them then.
  it("never fades an accent button to say it is disabled", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(root)) {
        if (file === SELF) continue;
        readFileSync(file, "utf-8")
          .split("\n")
          .forEach((line, i) => {
            // `disabled:hover:bg-accent` carries two variants to
            // `disabled:bg-sand`'s one, so it wins and paints the accent back
            // on the moment the pointer rests on a button that will not respond.
            const fades = /\bdisabled:opacity-\d+/.test(line) && /\bbg-accent\b/.test(line);
            if (fades || /\bdisabled:hover:bg-accent\b/.test(line)) {
              offenders.push(`${relative(REPO_ROOT, file)}:${i + 1}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md §Over-video chrome: chrome painted onto a dark scrim does not
  // follow the theme, because the theme's foregrounds are picked against the
  // page background, not against black. `text-text-muted` over `bg-black/70`
  // measured 1.4:1 (UI redesign Bug-7).
  it("never puts a theme foreground on a black scrim", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(root)) {
        if (file === SELF) continue;
        readFileSync(file, "utf-8")
          .split("\n")
          .forEach((line, i) => {
            if (/\bbg-black\/\d+/.test(line) && /\btext-(text|accent|warm|sand)-/.test(line)) {
              offenders.push(`${relative(REPO_ROOT, file)}:${i + 1}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
