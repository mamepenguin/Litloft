import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

import { stripComments } from "./helpers/sourceScan";

/**
 * A control hidden by `opacity-0` is still in the tab order.
 *
 * That is the point — `hidden` and `invisible` would take it out, and
 * `group-focus-within` would have nothing to fire on (DESIGN.md
 * §Row Actions). But it means a reveal keyed on hover alone gives a
 * keyboard user a tab stop on a button they cannot see: four surfaces in
 * the trash and missing views did exactly that, and one of the buttons
 * deletes a file for good.
 *
 * So: wherever `opacity-0` is revealed by a group's hover, the same class
 * list must also reveal it on `group-focus-within`. Scanned rather than
 * listed, because the failure is a *new* row action written by copying an
 * old one.
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
 * Every string literal in the file, which is where a class list lives
 * whatever syntax carries it.
 *
 * Two literal spellings were read at first — `className="…"` and
 * ``className={`…`}`` — and the population came out right by luck. This
 * tree already writes class lists as `className={[ … ].join(" ")}` (18
 * sites, several of them the player overlays where hover-revealed
 * controls live), as `className={cond ? "…" : "…"}`, and as a variable
 * built elsewhere. A new row action copied into any of those shapes
 * would be invisible, the count would stay green, and none of the three
 * rules below would reach it.
 *
 * Reading every literal is safe because the filter is `opacity-0` beside
 * `group-hover…:opacity-100`, which no prose carries by accident — and
 * comments are blanked first so a sentence about the recipe is not the
 * recipe.
 */
function classLists(text: string): string[] {
  const stripped = stripComments(text);
  const out: string[] = [];
  for (const m of stripped.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

/** Files holding both tokens anywhere, however the class list is written. */
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
        else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) && full !== SELF) {
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
 * A drag handle is a pointer affordance and nothing else.
 *
 * Both sidebar handles carry `tabIndex={-1}`, so they are not in the tab
 * order and the defect this file exists for — a tab stop on a button
 * nobody can see — cannot arise on them. Reordering by keyboard is not
 * offered through the handle at all. On touch the reorder gesture is a
 * long press on the row rather than a grab on a 12px target, so revealing
 * them there would put a control on screen that does nothing when tapped.
 *
 * They are in the population because they are written in the same shape,
 * and named here so their absence from both rules is a decision rather
 * than an oversight. If either ever becomes focusable, it leaves this list.
 */
const FOCUS_AND_TOUCH_EXEMPT = [
  "frontend/src/components/sidebar/SectionDragHandle.tsx",
  "frontend/src/components/sidebar/ItemDragHandle.tsx",
];

/** Reveals still keyed on an unnamed `group`. Shrinks, never grows. */
const UNNAMED_GROUPS = [
  "frontend/src/components/FileCard.tsx",
  "frontend/src/components/FileListRow.tsx",
  "frontend/src/components/FolderListRow.tsx",
  "frontend/src/components/JustifiedFileCell.tsx",
  "frontend/src/components/sidebar/ItemDragHandle.tsx",
  "frontend/src/components/sidebar/SectionDragHandle.tsx",
];

describe("a row action revealed by hover is revealed by focus too", () => {
  const reveals = hoverReveals();

  it("finds the reveals it is meant to be checking", () => {
    // Exact. A lower bound would let the scan silently stop matching —
    // and "all of them are fine" is true of an empty list. Four are the
    // trash and missing surfaces this rule was written for, one reveal
    // each; the other nine already had some form of it.
    expect(reveals.length).toBe(13);
    for (const named of [
      "frontend/src/components/trash/TrashFileGrid.tsx",
      "frontend/src/components/trash/TrashFileList.tsx",
      "frontend/src/components/missing/MissingFileGrid.tsx",
      "frontend/src/components/missing/MissingFileList.tsx",
    ]) {
      expect(reveals.map((r) => r.where)).toContain(named);
    }
  });

  /**
   * Three spellings satisfy this, and the reason they all count is that
   * the property is "a keyboard user can see it", not "it is written the
   * way §Row Actions writes it".
   *
   * - `group-focus-within/<name>:opacity-100` — the row reveals it, which
   *   is the form §Row Actions asks for and the only one that fires when
   *   the focus lands on the row's *primary* control rather than on the
   *   action itself.
   * - `focus-within:opacity-100` on the wrapper that holds the action —
   *   fires when the action inside it takes focus. Weaker (it does not
   *   answer focus elsewhere in the row) but it does clear the tab-stop-on-
   *   an-invisible-button defect, and five surfaces were already written
   *   that way before this rule existed.
   * - `focus-visible:opacity-100` on the action itself — same reach as the
   *   second, on the control rather than its wrapper.
   */
  /**
   * The cross-check that costs nothing: the set of *files* holding both
   * tokens anywhere must equal the set the class-list scan produced. A
   * spelling the extractor cannot read then fails loudly here instead of
   * shrinking the population in silence.
   */
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

  /**
   * `group-hover` compiles inside `@media (hover: hover)`, so on a touch
   * device the reveal never fires at all and the action is invisible and
   * unreachable — not merely hidden until hovered.
   */
  it("keeps the exempt pair out of the tab order, which is why they are exempt", () => {
    // The exemption's own premise, checked rather than asserted in prose:
    // if a handle became focusable it would be a tab stop on something
    // invisible, and the reason it is on the list would have evaporated.
    for (const rel of FOCUS_AND_TOUCH_EXEMPT) {
      const body = readFileSync(resolve(REPO_ROOT, rel), "utf-8");
      expect(body, rel).toContain("tabIndex={-1}");
    }
  });

  it("shows every one of them on a coarse pointer", () => {
    const offenders = reveals
      .filter((r) => !/\bpointer-coarse:opacity-100\b/.test(r.classes))
      .filter((r) => !FOCUS_AND_TOUCH_EXEMPT.includes(r.where))
      .map((r) => r.where);
    // The mini player is not on this list, and the near miss is worth
    // recording: it is gated on `(min-width: 768px)`, which is a width and
    // not a pointer, so a large tablet reaches it with a coarse pointer and
    // would have had two invisible controls. Gating on width is not an
    // exemption from a pointer rule.
    expect(offenders).toEqual([]);
  });

  /**
   * §Row Actions asks for `group/<name>` rather than a bare `group`: two
   * nested groups otherwise both answer the same hover, and a card inside
   * a row reveals the row's actions.
   *
   * The unnamed ones are not listed as exceptions with reasons, because
   * they have none — they are the sites this convention arrived too late
   * for, and naming their groups means touching the row's class as well as
   * the action's. Held at an exact count so the set can only shrink.
   */
  it("names the group where the convention has reached", () => {
    const unnamed = reveals
      .filter((r) => !/\bgroup-hover\/[\w-]+:opacity-100\b/.test(r.classes))
      .map((r) => r.where)
      .sort();
    expect(unnamed).toEqual(UNNAMED_GROUPS);
  });
});
