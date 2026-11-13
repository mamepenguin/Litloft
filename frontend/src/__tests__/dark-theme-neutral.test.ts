import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FRONTEND = resolve(REPO_ROOT, "frontend");
const GLOBALS_CSS = resolve(FRONTEND, "src/app/globals.css");
const LAYOUT_TSX = resolve(FRONTEND, "src/app/layout.tsx");
const MANIFEST = resolve(FRONTEND, "public/manifest.json");

const CHANGED_DARK: Record<string, { current: string; next: string }> = {
  "--bg-primary": { current: "#1a0e10", next: "#131312" },
  "--bg-card": { current: "#231216", next: "#1c1c1b" },
  "--bg-elevated": { current: "#2f191b", next: "#272725" },
  "--bg-sidebar": { current: "#1a0e10", next: "#131312" },
  "--text-primary": { current: "#f5e6e8", next: "#eeeeea" },
  "--text-muted": { current: "#c4a0a4", next: "#a5a59f" },
  "--sand": { current: "#3d2023", next: "#2f2f2c" },
  "--sand-hover": { current: "#4a2a2e", next: "#3a3a37" },
  "--warm-light": { current: "#3d2023", next: "#2f2f2c" },
  "--warm-silver": { current: "#7a6668", next: "#8a8a84" },
  "--dark-surface": { current: "#0d0608", next: "#0b0b0a" },
};

const UNCHANGED_DARK: Record<string, string> = {
  "--bg-border": "rgba(255, 255, 255, 0.08)",
  "--accent": "#e85d5e",
  "--accent-hover": "#f07070",
  "--accent-cta": "#e85d5e",
  "--accent-teal": "#4caf80",
  "--accent-amber": "#f4c674",
  "--player-indicator": "#ffffff",
  "--focus-ring": "#617bff",
  "--danger": "#ff8a8a",
  "--danger-bg": "rgba(255, 45, 66, 0.12)",
  "--highlight-bg": "rgba(244, 198, 116, 0.55)",
  "--mark-bg": "rgba(126, 200, 126, 0.32)",
  "--kbd-shadow": "inset 0 -1px 0 rgba(255, 255, 255, 0.2)",
  "--shadow-card":
    "0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25)",
  "--graph-cat-1": "#e85d5e",
  "--graph-cat-2": "#4caf80",
  "--graph-cat-3": "#f0a847",
  "--graph-cat-4": "#c98bc0",
  "--graph-cat-5": "#bdb869",
  "--graph-cat-6": "#7fa6d4",
};

const LIGHT_BLOCK: Record<string, string> = {
  "--bg-primary": "#ffffff",
  "--bg-card": "#ffffff",
  "--bg-elevated": "#f6f6f3",
  "--bg-sidebar": "#ffffff",
  "--bg-border": "rgba(145, 145, 140, 0.2)",
  "--text-primary": "#211922",
  "--text-muted": "#62625b",
  "--accent": "#d63031",
  "--accent-hover": "#b52425",
  "--accent-cta": "#d63031",
  "--accent-teal": "#103c25",
  "--accent-amber": "#78350f",
  "--player-indicator": "var(--accent)",
  "--player-indicator-track": "rgba(112, 112, 112, 0.85)",
  "--sand": "#e5e5e0",
  "--sand-hover": "#d5d5d0",
  "--warm-light": "#e0e0d9",
  "--warm-silver": "#91918c",
  "--dark-surface": "#33332e",
  "--focus-ring": "#435ee5",
  "--danger": "#9e0a0a",
  "--danger-bg": "rgba(230, 0, 35, 0.08)",
  "--highlight-bg": "#fff8c5",
  "--mark-bg": "#dff0cf",
  "--kbd-shadow": "inset 0 -1px 0 #b8c0c8",
  "--shadow-card":
    "0 1px 2px rgba(33, 25, 34, 0.04), 0 1px 3px rgba(33, 25, 34, 0.04)",
  "--graph-cat-1": "#d63031",
  "--graph-cat-2": "#1f7a5a",
  "--graph-cat-3": "#c2740a",
  "--graph-cat-4": "#8e4585",
  "--graph-cat-5": "#7c7a45",
  "--graph-cat-6": "#3f6fa3",
  "color-scheme": "light",
};

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The declarations of the one top-level rule whose whole selector is
 * `selectorPattern`. A rule is top-level when it opens the file or follows a
 * closing brace or an at-statement's semicolon, which keeps out selector lists
 * and descendant selectors that merely start with the same text.
 */
function declarationsOf(css: string, selectorPattern: string): [string, string][] {
  const re = new RegExp(`(?:^|[;}])\\s*${selectorPattern}\\s*\\{([^{}]*)\\}`, "g");
  const bodies = [...stripCssComments(css).matchAll(re)].map((m) => m[1]);
  expect(bodies, `exactly one block for ${selectorPattern}`).toHaveLength(1);
  return bodies[0]
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .map((d) => {
      const colon = d.indexOf(":");
      return [d.slice(0, colon).trim(), normalise(d.slice(colon + 1))];
    });
}

function asMap(entries: [string, string][]): Record<string, string> {
  const names = entries.map(([name]) => name);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  expect(duplicates, "properties declared more than once").toEqual([]);
  return Object.fromEntries(entries);
}

const DARK_SELECTOR = String.raw`\[data-theme="dark"\]`;
const LIGHT_SELECTOR = String.raw`:root\s*,\s*\[data-theme="light"\]`;

function darkTokens(): Record<string, string> {
  return asMap(declarationsOf(readFileSync(GLOBALS_CSS, "utf-8"), DARK_SELECTOR));
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("SPEC-CORE-097 neutral near-black dark theme", () => {
  it("SPEC-CORE-097 I1: the dark block declares exactly the 31 listed tokens and color-scheme", () => {
    const expected: Record<string, string> = { "color-scheme": "dark" };
    for (const [name, { next }] of Object.entries(CHANGED_DARK)) expected[name] = next;
    for (const [name, value] of Object.entries(UNCHANGED_DARK)) expected[name] = normalise(value);
    expect(Object.keys(expected)).toHaveLength(32);

    expect(darkTokens()).toEqual(expected);
  });

  it("SPEC-CORE-097 I2: every changed dark token is near-achromatic with a faint warmth", () => {
    const tokens = darkTokens();
    const tinted = Object.keys(CHANGED_DARK).flatMap((name) => {
      const [r, g, b] = rgb(tokens[name] ?? "");
      const ok = Math.abs(r - g) <= 1 && b <= r && r - b <= 8;
      return ok ? [] : [`${name}: ${tokens[name]}`];
    });
    expect(tinted).toEqual([]);
  });

  it("SPEC-CORE-097 I3: the light block keeps exactly its listed declarations", () => {
    const light = asMap(
      declarationsOf(readFileSync(GLOBALS_CSS, "utf-8"), LIGHT_SELECTOR),
    );
    const expected = Object.fromEntries(
      Object.entries(LIGHT_BLOCK).map(([k, v]) => [k, normalise(v)]),
    );
    expect(light).toEqual(expected);
  });

  it("SPEC-CORE-097 I4: dark surfaces get strictly lighter from --dark-surface to --sand-hover", () => {
    const tokens = darkTokens();
    const order = [
      "--dark-surface",
      "--bg-primary",
      "--bg-card",
      "--bg-elevated",
      "--sand",
      "--sand-hover",
    ];
    const steps = order.slice(1).flatMap((name, i) => {
      const below = order[i];
      return luminance(tokens[name]) > luminance(tokens[below])
        ? []
        : [`${below} (${tokens[below]}) is not darker than ${name} (${tokens[name]})`];
    });
    expect(steps).toEqual([]);
  });

  it("SPEC-CORE-097 I5: dark text tokens reach 4.5:1 on the surfaces they sit on", () => {
    const tokens = darkTokens();
    const pairs: [string, string][] = [];
    for (const text of ["--text-primary", "--text-muted"]) {
      for (const bg of ["--bg-primary", "--bg-card", "--bg-elevated", "--sand"]) {
        pairs.push([text, bg]);
      }
    }
    pairs.push(["--warm-silver", "--bg-primary"], ["--warm-silver", "--bg-card"]);

    const short = pairs.flatMap(([fg, bg]) => {
      const ratio = contrast(tokens[fg], tokens[bg]);
      return ratio >= 4.5
        ? []
        : [`${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}): ${ratio.toFixed(2)}:1`];
    });
    expect(short).toEqual([]);
  });

  it("SPEC-CORE-097 I6: the dark theme-color and the manifest colours equal the dark --bg-primary", () => {
    const bgPrimary = darkTokens()["--bg-primary"];

    const layout = readFileSync(LAYOUT_TSX, "utf-8");
    const darkEntries = [
      ...layout.matchAll(
        /media:\s*["']\(prefers-color-scheme:\s*dark\)["']\s*,\s*color:\s*["']([^"']+)["']/g,
      ),
    ].map((m) => m[1].toLowerCase());
    expect(darkEntries).toEqual([bgPrimary]);

    const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8"));
    expect({
      background_color: String(manifest.background_color).toLowerCase(),
      theme_color: String(manifest.theme_color).toLowerCase(),
    }).toEqual({ background_color: bgPrimary, theme_color: bgPrimary });
  });

  it("SPEC-CORE-097 I7: no shipped file still carries an old plum or brown colour", () => {
    const needles = [
      ...new Set(Object.values(CHANGED_DARK).map(({ current }) => current)),
      "#1a0e08",
      "#2d1810",
    ];
    const addonLinks = resolve(FRONTEND, "src/addons");
    const roots = ["frontend/src", "frontend/public", "ios/Litloft"].map((r) =>
      resolve(REPO_ROOT, r),
    );

    const files: string[] = [];
    const walk = (dir: string) => {
      if (dir === addonLinks) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") walk(full);
        } else if (entry.isFile()) {
          files.push(full);
        } else if (entry.isSymbolicLink() && existsSync(full) && full !== addonLinks) {
          if (!statSync(full).isDirectory()) files.push(full);
        }
      }
    };
    for (const root of roots) {
      expect(existsSync(root), `${relative(REPO_ROOT, root)} exists`).toBe(true);
      walk(root);
    }
    expect(files.length).toBeGreaterThan(0);

    const hits = files.flatMap((file) => {
      const text = readFileSync(file, "latin1").toLowerCase();
      return needles
        .filter((n) => text.includes(n))
        .map((n) => `${relative(REPO_ROOT, file)}: ${n}`);
    });
    expect(hits).toEqual([]);
  });
});
