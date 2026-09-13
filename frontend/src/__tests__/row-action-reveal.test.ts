import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
 * A control hidden by `opacity-0` is still in the tab order, so a reveal keyed
 * on hover alone gives a keyboard user a tab stop on a button they cannot see.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const SRC = resolve(REPO_ROOT, "frontend/src");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const ADDON_LINK_DIR = resolve(SRC, "addons");

const SOURCE_ROOTS: Array<[string, string]> = [
  ["frontend/src", SRC],
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e): [string, string] => [
          `addons/${e.name}/frontend`,
          resolve(ADDONS_DIR, e.name, "frontend"),
        ])
    : []),
];

/**
 * Every string literal, not just `className="…"`: class lists are also written
 * as `[…].join(" ")`, ternaries and variables.
 */
function classLists(text: string): string[] {
  const stripped = stripComments(text);
  const out: string[] = [];
  for (const m of stripped.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

function filesWithBothTokens(): string[] {
  const out: string[] = [];
  for (const { rel, body } of allSources()) {
    if (/\bopacity-0\b/.test(body) && /\bgroup-hover(\/[\w-]+)?:opacity-100\b/.test(body)) {
      out.push(rel);
    }
  }
  return out.sort();
}

interface Reveal {
  where: string;
  classes: string;
}

function allSources(): Array<{ rel: string; body: string }> {
  const out: Array<{ rel: string; body: string }> = [];
  for (const [label, root] of SOURCE_ROOTS) {
    if (!existsSync(root)) continue;
    const walk = (dir: string) => {
      if (dir === ADDON_LINK_DIR) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        if (entry.name === "__tests__") continue;
        if (!existsSync(full)) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.test\.tsx?$/.test(entry.name) &&
          full !== SELF
        ) {
          const rel =
            label === "frontend/src"
              ? `frontend/src/${relative(SRC, full)}`
              : `${label}/${relative(root, full)}`;
          out.push({ rel, body: stripComments(readFileSync(full, "utf-8")) });
        }
      }
    };
    walk(root);
  }
  return out;
}

function hoverReveals(): Reveal[] {
  const out: Reveal[] = [];
  for (const { rel, body } of allSources()) {
    for (const classes of classLists(body)) {
      if (!/\bopacity-0\b/.test(classes)) continue;
      if (!/\bgroup-hover(\/[\w-]+)?:opacity-100\b/.test(classes)) continue;
      out.push({ where: rel, classes });
    }
  }
  return out;
}

/**
 * Drag handles are `tabIndex={-1}`, and on touch the reorder gesture is a long
 * press on the row, so revealing them there would show a control that does
 * nothing when tapped.
 */
const FOCUS_AND_TOUCH_EXEMPT = [
  "frontend/src/components/sidebar/SectionDragHandle.tsx",
  "frontend/src/components/sidebar/ItemDragHandle.tsx",
];

/** Shrinks, never grows. */
const UNNAMED_GROUPS = [
  "frontend/src/components/FileCard.tsx",
  "frontend/src/components/JustifiedFileCell.tsx",
  "frontend/src/components/rowFurniture.ts",
  "frontend/src/components/sidebar/ItemDragHandle.tsx",
  "frontend/src/components/sidebar/SectionDragHandle.tsx",
];

describe("a row action revealed by hover is revealed by focus too", () => {
  const reveals = hoverReveals();

  it("finds the reveals it is meant to be checking", () => {
    expect(reveals.length).toBe(12);
    for (const named of [
      "frontend/src/components/trash/TrashFileGrid.tsx",
      "frontend/src/components/trash/TrashFileList.tsx",
      "frontend/src/components/missing/MissingFileGrid.tsx",
      "frontend/src/components/missing/MissingFileList.tsx",
    ]) {
      expect(reveals.map((r) => r.where)).toContain(named);
    }
  });

  it("reads every file that holds the pair", () => {
    const scanned = [...new Set(reveals.map((r) => r.where))].sort();
    expect(scanned).toEqual(filesWithBothTokens());
  });

  it("reveals every one of them on focus as well", () => {
    const REVEALS_ON_FOCUS =
      /\b(group-focus-within(\/[\w-]+)?:opacity-100|focus-within:opacity-100|focus-visible:opacity-100)\b/;
    const offenders = reveals
      .filter((r) => !REVEALS_ON_FOCUS.test(r.classes))
      .filter((r) => !FOCUS_AND_TOUCH_EXEMPT.includes(r.where))
      .map((r) => r.where);
    expect(offenders).toEqual([]);
  });

  it("keeps the exempt pair out of the tab order, which is why they are exempt", () => {
    for (const rel of FOCUS_AND_TOUCH_EXEMPT) {
      const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
      expect(body, rel).toContain("tabIndex={-1}");
    }
  });

  it("shows every one of them on a coarse pointer", () => {
    // `group-hover` compiles inside `@media (hover: hover)`, so on touch the
    // reveal never fires. Gating on width is not an exemption: a large tablet
    // has a coarse pointer.
    const offenders = reveals
      .filter((r) => !/\bpointer-coarse:opacity-100\b/.test(r.classes))
      .filter((r) => !FOCUS_AND_TOUCH_EXEMPT.includes(r.where))
      .map((r) => r.where);
    expect(offenders).toEqual([]);
  });

  /**
   * A bare `group` lets two nested groups answer the same hover, so a card
   * inside a row reveals the row's actions.
   */
  it("names the group where the convention has reached", () => {
    const unnamed = reveals
      .filter((r) => !/\bgroup-hover\/[\w-]+:opacity-100\b/.test(r.classes))
      .map((r) => r.where)
      .sort();
    expect(unnamed).toEqual(UNNAMED_GROUPS);
  });
});
