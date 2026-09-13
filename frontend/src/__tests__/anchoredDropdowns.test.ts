import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Core only: addon files are pinned at a submodule commit, so an exact
 * population here would depend on which side of a pointer bump the checkout is on.
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
 * Every needle below is also a word comments write *about* the mechanism, so a
 * scan over raw text would report those comments as members of the population.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function read(rel: string): string {
  return withoutComments(readFileSync(resolve(REPO_ROOT, rel), "utf-8"));
}

const DIRECTION_NEEDLE = /top-full|bottom-full|ANCHORED_VERTICAL|useMenuSurface/;

function directionFiles(): string[] {
  return sourceFiles(CORE_ROOT)
    .filter((file) => DIRECTION_NEEDLE.test(withoutComments(readFileSync(file, "utf-8"))))
    .map((file) => relative(REPO_ROOT, file))
    .sort();
}

/**
 * Declared, never derived: a table built from what the scan found would
 * agree with the scan by construction.
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
 * The lookbehind admits `ToolbarMenu`'s `sm:top-full`: its surface is a sheet
 * below 640px, and the table has no scoped spelling to give it.
 */
const HAND_SPELLED_CORNER = /(?<![-:\w])(?:top-full|bottom-full)/;

describe("every anchored dropdown in core", () => {
  it("is enumerated, with what it does about direction", () => {
    expect(directionFiles()).toEqual(Object.keys(DIRECTION_ROLES).sort());
  });

  it("has all four roles filled, and each by the files named for it", () => {
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
          expect(HAND_SPELLED_CORNER.test(source)).toBe(false);
          break;
        case "takes-the-surface":
          expect(source).toContain("useMenuSurface(");
          expect(source).not.toContain("useAnchoredDirection(");
          expect(HAND_SPELLED_CORNER.test(source)).toBe(false);
          break;
        case "pinned":
          expect(HAND_SPELLED_CORNER.test(source)).toBe(true);
          expect(source).not.toContain("useAnchoredDirection(");
          expect(source).not.toContain("useMenuSurface(");
          break;
        case "supplies":
          expect(source).toContain("ANCHORED_VERTICAL");
          expect(source).toContain("top-full");
          expect(source).toContain("bottom-full");
          break;
      }
    },
  );
});

/** Tailwind's spacing scale is `0.25rem` per step at the default root font size. */
const TAILWIND_STEP_PX = 4;

describe("the vertical table", () => {
  it("states the same gap its classes draw", async () => {
    const { ANCHORED_VERTICAL } = await import("@/hooks/useAnchoredDirection");
    const steps = Object.keys(ANCHORED_VERTICAL);
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
    // vertical edge from the direction it grows in.
    expect(ANCHORED_ORIGIN["down-left"]).toBe("origin-top-left");
    expect(ANCHORED_ORIGIN["down-right"]).toBe("origin-top-right");
    expect(ANCHORED_ORIGIN["up-left"]).toBe("origin-bottom-left");
    expect(ANCHORED_ORIGIN["up-right"]).toBe("origin-bottom-right");
  });
});

/**
 * `clippingFrame` tests `/auto|scroll|hidden/`, which `clip` does not match,
 * so a `clip` ancestor hands the walk the next box out. Whoever adds an
 * occurrence has to decide whether it is a box the walk should see.
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
    const source = readFileSync(
      resolve(REPO_ROOT, "frontend/src/hooks/useAnchoredDirection.ts"),
      "utf-8",
    );
    const test = /\/auto\|scroll\|hidden\//.exec(withoutComments(source));
    expect(test).not.toBeNull();
    expect(/auto|scroll|hidden/.test("clip")).toBe(false);
  });
});
