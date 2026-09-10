import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every anchored dropdown in core takes its direction from one place.
 *
 * ## What this holds
 *
 * A population claim, and it is the only instrument there is for one: that
 * the set of files deciding a panel's vertical direction is exactly the set
 * enumerated below, and that each of them reaches that decision through
 * `useAnchoredDirection` — directly, or through `useMenuSurface`, which is
 * the toolbar family's one caller of it.
 *
 * It exists because the failure it is written against is silent. Ten sites
 * hard-coded `top-full` before this sweep, and each was a defect waiting for
 * the viewport that exposed it; the eleventh would arrive the same way, as a
 * class list nobody compared against anything. `review-workflow.md` records
 * three occasions where a shared recipe was extracted and the file that
 * needed it most was left out, and three more since.
 *
 * ## What it cannot hold
 *
 * It reads source text in node. Nothing is rendered, so:
 *
 *  - **It cannot say the answer reaches the panel.** A file that imports the
 *    hook and drops the result on the floor passes. What pins the answer to a
 *    class at each site is that site's own test; what pins the class to a box
 *    is `e2e-components/anchored-direction.spec.ts` and
 *    `e2e-layout/toolbar-menu.spec.ts`, in a browser.
 *  - **It cannot see a panel that spells its direction some other way** — an
 *    inline `style={{ top }}`, a `translate-y`, a `data-` attribute driving a
 *    stylesheet. The needles below are the spellings the tree uses; a
 *    fourteenth way of saying "downward" is outside them, and no enumeration
 *    of spellings can close that.
 *  - **It is core only.** An addon is a separate repository and its files are
 *    pinned at a submodule commit, so an exact population here would be a
 *    claim about which side of a pointer bump the checkout is on.
 *    `popup-dismissal.test.ts` records that reasoning at length.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CORE_ROOT = resolve(REPO_ROOT, "frontend/src");
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue;
      // Symlinks into the submodules: another repository's files.
      if (full.startsWith(ADDON_LINK_DIR)) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * Source with its comments removed.
 *
 * Every needle below is also a word this repository writes *about* the
 * mechanism — `DESIGN.md`'s rule is quoted in half a dozen docstrings — so a
 * scan over raw text would find the paragraphs explaining the population and
 * report them as members of it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function read(rel: string): string {
  return withoutComments(readFileSync(resolve(REPO_ROOT, rel), "utf-8"));
}

/**
 * How a file can say which way a panel hangs.
 *
 * Three spellings, and which one a file writes says what it is:
 *
 *  - `top-full` / `bottom-full` — the corner written out. After this sweep
 *    only two files write either: the hook's own table, and `SelectionBar`,
 *    whose direction is right by construction.
 *  - `ANCHORED_VERTICAL` — the table, taken by a site that measures.
 *  - `useMenuSurface` — the toolbar surface, which takes the table for its
 *    callers and adds the `sm:` scoping its sheet form needs.
 */
const DIRECTION_NEEDLE = /top-full|bottom-full|ANCHORED_VERTICAL|useMenuSurface/;

/** Files that say something about a panel's vertical direction. */
function directionFiles(): string[] {
  return sourceFiles(CORE_ROOT)
    .filter((file) => DIRECTION_NEEDLE.test(withoutComments(readFileSync(file, "utf-8"))))
    .map((file) => relative(REPO_ROOT, file))
    .sort();
}

/**
 * What each member of the population is.
 *
 * `measures` — it calls `useAnchoredDirection` itself.
 * `takes-the-surface` — it calls `useMenuSurface`, which calls the hook.
 * `pinned` — it states a direction, and the rule accommodates it.
 * `supplies` — it *is* the mechanism.
 *
 * Declared, never derived. A table built from what the scan found would
 * agree with the scan by construction: both sides lose a member at once and
 * the case stays green, which is detector rule 5 and the shape this
 * workstream has now written twenty-three times.
 */
const DIRECTION_ROLES = {
  "frontend/src/components/AddButton.tsx": "measures",
  "frontend/src/components/EditableTagChips.tsx": "measures",
  "frontend/src/components/FileActions.tsx": "measures",
  "frontend/src/components/FolderPicker.tsx": "measures",
  "frontend/src/components/SmartFolderSaveButton.tsx": "measures",
  "frontend/src/components/ToolbarMenu.tsx": "measures",
  "frontend/src/components/folder/FilterField.tsx": "measures",
  "frontend/src/components/trash/TrashToolbar.tsx": "measures",

  "frontend/src/components/OverflowMenu.tsx": "takes-the-surface",
  "frontend/src/components/SortButton.tsx": "takes-the-surface",
  "frontend/src/components/archive/ArchiveToolbar.tsx": "takes-the-surface",
  "frontend/src/components/folder/FilterMenu.tsx": "takes-the-surface",
  "frontend/src/components/folder/FolderToolbar.tsx": "takes-the-surface",

  "frontend/src/components/SelectionBar.tsx": "pinned",

  "frontend/src/hooks/useAnchoredDirection.ts": "supplies",
} as const;

type Role = (typeof DIRECTION_ROLES)[keyof typeof DIRECTION_ROLES];

const ROLES = [
  "measures",
  "takes-the-surface",
  "pinned",
  "supplies",
] as const satisfies readonly Role[];

/**
 * A corner written out, and not as part of a breakpoint-scoped spelling.
 *
 * `ToolbarMenu` writes `sm:top-full` on purpose — its surface is a sheet
 * below 640px and an anchored panel above it, so the anchored form's classes
 * are scoped and the sheet's are not. That is the one legitimate hand-written
 * corner outside `ANCHORED_VERTICAL`, and it is legitimate because the table
 * has no scoped spelling to give it.
 */
const HAND_SPELLED_CORNER = /(?<![-:\w])(?:top-full|bottom-full)/;

describe("every anchored dropdown in core", () => {
  it("is enumerated, with what it does about direction", () => {
    expect(directionFiles()).toEqual(Object.keys(DIRECTION_ROLES).sort());
  });

  it("has all four roles filled, and each by the files named for it", () => {
    // Not a count of the table: a count agrees with itself. Every role has
    // to have a member, or the loops below quietly stop asserting anything
    // about it — measured on the shape this replaces, where a role emptied
    // by moving its one file left three green cases and one dead branch.
    expect(ROLES).toHaveLength(4);
    const byRole = Object.fromEntries(
      ROLES.map((role) => [
        role,
        Object.entries(DIRECTION_ROLES)
          .filter(([, r]) => r === role)
          .map(([file]) => file),
      ]),
    );
    for (const role of ROLES) expect(byRole[role].length).toBeGreaterThan(0);

    // And the three that are one file each are named, so moving a member
    // between roles is a failure rather than a re-balance.
    expect(byRole.pinned).toEqual(["frontend/src/components/SelectionBar.tsx"]);
    expect(byRole.supplies).toEqual([
      "frontend/src/hooks/useAnchoredDirection.ts",
    ]);
    expect(byRole.measures).toHaveLength(8);
    expect(byRole["takes-the-surface"]).toHaveLength(5);
  });

  it.each(Object.entries(DIRECTION_ROLES))(
    "%s does what it is named for",
    (file, role) => {
      const source = read(file);
      switch (role) {
        case "measures":
          expect(source).toContain("useAnchoredDirection(");
          // And takes the corner from the table rather than writing one.
          // This is the half that catches a conversion half-done: a site
          // that calls the hook and then spells `top-full` anyway has an
          // answer nothing acts on.
          expect(HAND_SPELLED_CORNER.test(source)).toBe(false);
          break;
        case "takes-the-surface":
          expect(source).toContain("useMenuSurface(");
          expect(source).not.toContain("useAnchoredDirection(");
          expect(HAND_SPELLED_CORNER.test(source)).toBe(false);
          break;
        case "pinned":
          // The exception the rule accommodates rather than converts. It
          // states its corner and measures nothing, and it has to keep
          // doing both: a `SelectionBar` that started measuring would be
          // asking a question whose answer is fixed by the bar it hangs
          // from.
          expect(HAND_SPELLED_CORNER.test(source)).toBe(true);
          expect(source).not.toContain("useAnchoredDirection(");
          expect(source).not.toContain("useMenuSurface(");
          break;
        case "supplies":
          // The mechanism itself: it is in the population because it holds
          // both corners for everyone else.
          expect(source).toContain("ANCHORED_VERTICAL");
          expect(source).toContain("top-full");
          expect(source).toContain("bottom-full");
          break;
      }
    },
  );
});

/**
 * The gap in `ANCHORED_VERTICAL` is the gap in the class beside it.
 *
 * Read back out of the class rather than compared to a second literal.
 * Unit E's `MENU_WIDTH_PX` could be halved with every test green because the
 * constant *stated* a measurement and nothing tied it to what the box was
 * drawn at; `ToolbarMenu.test.tsx` closes the same seam for the toolbar
 * surface by parsing its `sm:mt-1` back to 4.
 *
 * Tailwind's spacing scale is `0.25rem` per step at the default root font
 * size, which is the arithmetic being asserted — not a table lookup of the
 * same numbers.
 */
const TAILWIND_STEP_PX = 4;

describe("the vertical table", () => {
  it("states the same gap its classes draw", async () => {
    const { ANCHORED_VERTICAL } = await import("@/hooks/useAnchoredDirection");
    const steps = Object.keys(ANCHORED_VERTICAL);
    // Both steps, declared. A table walked back to one entry would leave
    // every case below green about the entry that remained.
    expect(steps).toEqual(["1", "2"]);

    for (const [step, entry] of Object.entries(ANCHORED_VERTICAL)) {
      expect(entry.down).toBe(`top-full mt-${step}`);
      expect(entry.up).toBe(`bottom-full mb-${step}`);
      expect(entry.px).toBe(Number(step) * TAILWIND_STEP_PX);
    }
  });

  it("names a corner in both directions, and opposite ones", async () => {
    const { ANCHORED_ORIGIN } = await import("@/hooks/useAnchoredDirection");
    expect(Object.keys(ANCHORED_ORIGIN).sort()).toEqual([
      "down-left",
      "down-right",
      "up-left",
      "up-right",
    ]);
    // The corner is the one the panel hangs from, which is the *opposite*
    // vertical edge from the direction it grows in: a panel hanging above
    // its trigger is pinned by its own bottom edge. Getting this backwards
    // is the defect the table exists to prevent, and it reads plausibly
    // either way, so it is asserted rather than left to the names.
    expect(ANCHORED_ORIGIN["down-left"]).toBe("origin-top-left");
    expect(ANCHORED_ORIGIN["down-right"]).toBe("origin-top-right");
    expect(ANCHORED_ORIGIN["up-left"]).toBe("origin-bottom-left");
    expect(ANCHORED_ORIGIN["up-right"]).toBe("origin-bottom-right");
  });
});

/**
 * `overflow: clip` is a clipping box the walk does not see.
 *
 * `clippingFrame` tests `/auto|scroll|hidden/`, which `clip` does not match.
 * A `clip` ancestor between a panel and its column therefore hands the walk
 * the *next* box out — usually the visible band — and the panel is measured
 * against room it does not have. Nothing fails; the menu is simply drawn into
 * a box that clips it.
 *
 * **This is written as an enumeration rather than as a sentence in the hook,
 * on purpose.** "The one `overflow-clip` in the tree is full-width, so the
 * walk cannot be wrong today" is a *measurement*: it is true of this tree and
 * says nothing about the next one, and `review-workflow.md` names that shape
 * — state the mechanism, not the measurement. A second `overflow-clip`, put
 * somewhere that actually bounds a menu, would make the sentence false in
 * silence. So the population is pinned instead, and whoever adds the second
 * one is asked the question the sentence would have answered for them:
 * **is this a box the walk should see?**
 *
 * If the answer is yes, the fix is one alternative in that regex plus a case
 * in `useAnchoredDirection.test.tsx` — and it is a behaviour change, because
 * the walk then stops at a box it used to pass through.
 *
 * Enumerated by the text the occurrence is written in rather than by a line
 * number: a line number is edited by every insertion above it, and a count
 * is a claim of completeness that goes stale without saying so.
 */
const OVERFLOW_CLIP_OCCURRENCES = [
  'frontend/src/components/folder/TwoPaneLayout.tsx :: ' +
    '<div className="flex h-[calc(100dvh-3.5rem)] w-full overflow-clip">',
] as const;

describe("overflow: clip", () => {
  it("occurs only where the walk not seeing it cannot matter", () => {
    const found: string[] = [];
    for (const file of sourceFiles(CORE_ROOT)) {
      const rel = relative(REPO_ROOT, file);
      for (const line of withoutComments(readFileSync(file, "utf-8")).split("\n")) {
        if (/overflow-clip|overflow:\s*clip|overflowClip/.test(line)) {
          found.push(`${rel} :: ${line.trim()}`);
        }
      }
    }
    expect(found.sort()).toEqual([...OVERFLOW_CLIP_OCCURRENCES].sort());
  });

  it("is invisible to the walk, which is the fact the enumeration is for", async () => {
    // The premise, asserted rather than asserted-about. Widening the regex
    // in `clippingFrame` to admit `clip` turns this red, which is the
    // reminder to come back here and shorten the list above.
    const source = readFileSync(
      resolve(REPO_ROOT, "frontend/src/hooks/useAnchoredDirection.ts"),
      "utf-8",
    );
    const test = /\/auto\|scroll\|hidden\//.exec(withoutComments(source));
    expect(test).not.toBeNull();
    expect(/auto|scroll|hidden/.test("clip")).toBe(false);
  });
});
