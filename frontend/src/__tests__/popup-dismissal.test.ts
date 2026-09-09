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
 * Every popup in core is dismissed by one primitive, on the click.
 *
 * Three behaviours coexisted here, and two of them handed the click
 * through to whatever was under the finger:
 *
 *  - a scrim dismissed on its `click` — correct, and what `DismissScrim`
 *    now is;
 *  - a `document` listener on `mousedown` / `pointerdown` / `touchstart`,
 *    which answers on the *press*, leaving the element underneath as the
 *    target of the `click` that follows;
 *  - a scrim dismissed on `pointerDown`, which unmounts itself before the
 *    tap's `click` is dispatched and so hit-tests to the same place.
 *
 * A mouse hides both: cancelling `pointerdown` suppresses the
 * compatibility mouse events, so only a phone finds them. The user did.
 *
 * ## Core only, and why that is not laziness
 *
 * `escape-listeners.test.ts` scans core *and* every addon, and can,
 * because it asserts an empty set that holds on both sides of a
 * submodule pointer bump. This one asserts an exact population — which a
 * pinned submodule makes impossible to state truthfully. Between an
 * addon's fix merging and core pinning it, the checked-out tree has the
 * old file; a set that admits both states is a lower bound, and rule 1
 * of the detector rules is that a lower bound is not a detector.
 *
 * So each repository asserts over its own tree. `addons/knowledge` has
 * its copy, over `WikiLinkAutocomplete`. The addons with no copy today —
 * `intelligence` (whose `FileAIActionsButton` already dismisses on its
 * scrim's click, correctly, but by hand), `media_import` and
 * `cloud-sync` — are unguarded by anything, and that is the hole: it
 * closes one addon repository at a time, not from here.
 *
 * ## What this file claims, and what it cannot
 *
 * It claims that the population is enumerated and that each member goes
 * through `DismissScrim` — a spelling check over source text, run in
 * node with nothing rendered. It claims nothing about hit testing: that
 * the scrim is the element a tap actually lands on, and that the control
 * underneath is spared, is measured with a real touch in Chromium by
 * `e2e-layout/popup-dismiss.spec.ts`. `DismissScrim.test.tsx` drives the
 * component and pins which event it answers.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

const CORE_ROOT = resolve(REPO_ROOT, "frontend/src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue;
      // `frontend/src/addons/*` are symlinks into the submodules. They are
      // another repository's files, asserted over there.
      if (full.startsWith(ADDON_LINK_DIR)) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function read(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), "utf-8");
}

/**
 * The file with its comments removed.
 *
 * The needles below are attribute spellings, and a docstring that names
 * one is describing a popup rather than declaring one. Measured: deleting
 * every ARIA attribute from `SortButton` left it in the population,
 * because a comment beside the rows quotes `role="menu"` while explaining
 * why they carry a role at all. The population would then have rested on
 * a sentence.
 */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

/**
 * What makes a file part of this population.
 *
 * The ARIA a popup surface declares, plus the attribute its trigger
 * carries. Deliberately wider than "things that render a scrim": it also
 * catches a menu *row* and a file that only opens someone else's panel,
 * so every one of those has to be named below with where its dismissal
 * lives. A new menu written from scratch matches at least one of these
 * before it has a scrim, which is the point — the failure names the file
 * rather than waiting for a phone to find it.
 */
const POPUP_NEEDLE = /role="menu"|role="menuitem"|role="listbox"|aria-haspopup/;

function popupFiles(roots: string[] = [CORE_ROOT]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      if (POPUP_NEEDLE.test(withoutComments(readFileSync(file, "utf-8")))) {
        out.push(relative(REPO_ROOT, file));
      }
    }
  }
  return out.sort();
}

interface PopupEntry {
  /**
   * The file that renders this popup's `DismissScrim`, or `null` when the
   * file is not a dismissable popup at all (a row, a mention in prose).
   */
  dismissedIn: string | null;
  why: string;
}

/**
 * Every file the sweep finds, and where its dismissal lives.
 *
 * Enumerated, not counted: a file that disappears leaves its key here
 * with nothing to match, and a file that appears is not in the table.
 */
const POPUPS: Record<string, PopupEntry> = {
  "frontend/src/components/ActionMenuItem.tsx": {
    dismissedIn: null,
    why:
      "a row inside someone else's menu; the menu owns the dismissal. It is " +
      "here because it declares `role=\"menuitem\"` — `AddonSlot` only names " +
      "that role in a docstring and is not in the population at all",
  },
  "frontend/src/components/AddButton.tsx": {
    dismissedIn: "frontend/src/components/AddButton.tsx",
    why: "the folder toolbar's Add menu",
  },
  "frontend/src/components/ContextMenu.tsx": {
    dismissedIn: "frontend/src/components/ContextMenu.tsx",
    why: "the right-click / long-press menu on a file or folder",
  },
  "frontend/src/components/FileActions.tsx": {
    dismissedIn: "frontend/src/components/FileActions.tsx",
    why: "the file's own ⋮ menu",
  },
  "frontend/src/components/FolderPicker.tsx": {
    dismissedIn: "frontend/src/components/FolderPicker.tsx",
    why: "the destination-folder panel, inside several dialogs",
  },
  "frontend/src/components/OverflowMenu.tsx": {
    dismissedIn: "frontend/src/components/OverflowMenu.tsx",
    why: "the shared … menu on a bar",
  },
  "frontend/src/components/SelectionBar.tsx": {
    dismissedIn: "frontend/src/components/SelectionBar.tsx",
    why: "the selection bar's overflow menu, below 640px",
  },
  "frontend/src/components/SmartFolderSaveButton.tsx": {
    dismissedIn: "frontend/src/components/SmartFolderSaveButton.tsx",
    why: "the saved-search menu",
  },
  "frontend/src/components/SortButton.tsx": {
    dismissedIn: "frontend/src/components/SortButton.tsx",
    why: "the icon-only sort menu",
  },
  "frontend/src/components/ToolbarMenu.tsx": {
    dismissedIn: "frontend/src/components/ToolbarMenu.tsx",
    why: "the labelled toolbar menus, and the surface FilterMenu shares",
  },
  "frontend/src/components/archive/ArchiveToolbar.tsx": {
    dismissedIn: "frontend/src/components/archive/ArchiveToolbar.tsx",
    why: "the archive bar's … menu",
  },
  "frontend/src/components/folder/FilterField.tsx": {
    dismissedIn: "frontend/src/components/folder/FilterField.tsx",
    why: "the kind-filter menu, in both of the forms it draws",
  },
  "frontend/src/components/folder/FilterMenu.tsx": {
    dismissedIn: "frontend/src/components/folder/FilterMenu.tsx",
    why: "the folder toolbar's Filter menu",
  },
  "frontend/src/components/folder/FolderToolbar.tsx": {
    dismissedIn: "frontend/src/components/folder/FolderToolbar.tsx",
    why: "the folder bar's … menu",
  },
  "frontend/src/components/folder/SortMenu.tsx": {
    dismissedIn: "frontend/src/components/ToolbarMenu.tsx",
    why: "draws its rows inside ToolbarMenu, which owns the scrim",
  },
  "frontend/src/components/gallery/SlideshowIntervalMenu.tsx": {
    dismissedIn:
      "frontend/src/components/player/MediaControls/parts/OverFrameSettingsPanel.tsx",
    why: "the interval panel is that shell, shared with the player's settings",
  },
  "frontend/src/components/trash/TrashToolbar.tsx": {
    dismissedIn: "frontend/src/components/trash/TrashToolbar.tsx",
    why: "the bin's kind-filter menu, below 640px",
  },
};

/**
 * A `document`- or `window`-level listener for a pointer *press*.
 *
 * The event, not the handler's body: a press listener at this scope is
 * either a popup dismissal — the defect — or one of the enumerated
 * exceptions. A listener on a specific element is a gesture on that
 * element and is not in scope.
 */
const OUTSIDE_PRESS =
  /\b(?:document|window)\.addEventListener\(\s*["'](?:mousedown|pointerdown|touchstart)["']/g;

function outsidePressListeners(roots: string[] = [CORE_ROOT]): string[] {
  const found: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf-8");
      const rel = relative(REPO_ROOT, file);
      for (const m of text.matchAll(OUTSIDE_PRESS)) {
        found.push(`${rel}:${text.slice(0, m.index!).split("\n").length}`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/**
 * The listeners that are not popup dismissals, with the reason each one
 * is a press rather than a click.
 *
 * Paths only, since the scan reports a line and an edit above one of
 * these should not have to be paid for here. A file may hold more than
 * one — `FilterField` carried a `mousedown` and a `touchstart` for the
 * same popup — so what is compared is the set of files.
 */
const OUTSIDE_PRESS_EXCEPTIONS: Record<string, string> = {
  "frontend/src/components/InlineNameEditor.tsx":
    "a text field, not a popup. An outside press *commits* the rename, and " +
    "the click that follows is meant to do its own job — clicking a row " +
    "while renaming another one should select that row. Never `blur`, " +
    "which also fires when a virtualised row scrolls out of view.",
};

describe("Every popup surface in core", () => {
  it("is named, with where its dismissal lives", () => {
    expect(popupFiles()).toEqual(Object.keys(POPUPS).sort());
  });

  it.each([
    'aria-haspopup="menu"',
    'role="menu"',
    'role="menuitem"',
    'role="listbox"',
  ])("is found by %s", (declaration) => {
    // Each needle separately, against a tree written for it. Core carries
    // no `role="listbox"` today — the knowledge addon's candidate list is
    // the only one in the tree — so that branch has no live example here
    // and would survive being deleted from the population's definition.
    const dir = mkdtempSync(join(tmpdir(), "popup-needle-"));
    const file = join(dir, "Sample.tsx");
    writeFileSync(file, `export const x = <div ${declaration} />;\n`);
    try {
      expect(popupFiles([dir])).toEqual([relative(REPO_ROOT, file)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not call every file a popup", () => {
    const dir = mkdtempSync(join(tmpdir(), "popup-needle-"));
    writeFileSync(join(dir, "Plain.tsx"), 'export const x = <div role="grid" />;\n');
    try {
      expect(popupFiles([dir])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("goes through DismissScrim", () => {
    const missing = Object.entries(POPUPS)
      .filter(([, e]) => e.dismissedIn !== null)
      .filter(([, e]) => !/<DismissScrim\b/.test(withoutComments(read(e.dismissedIn!))))
      .map(([file]) => file);
    expect(missing).toEqual([]);
  });

  it("is the only thing in core rendering a scrim", () => {
    // The other direction. Without it a scrim could be added to a file
    // the sweep does not reach, and the table above would still be
    // complete about the files it does.
    const rendering = sourceFiles(CORE_ROOT)
      .filter((f) => /<DismissScrim\b/.test(withoutComments(readFileSync(f, "utf-8"))))
      .map((f) => relative(REPO_ROOT, f))
      .sort();
    const declared = new Set(
      Object.values(POPUPS)
        .map((e) => e.dismissedIn)
        .filter((f): f is string => f !== null),
    );
    expect(rendering).toEqual([...declared].sort());
  });
});

describe("An outside press", () => {
  it("never dismisses a popup", () => {
    expect(
      [
        ...new Set(
          outsidePressListeners().map((hit) => hit.replace(/:\d+$/, "")),
        ),
      ].sort(),
    ).toEqual(Object.keys(OUTSIDE_PRESS_EXCEPTIONS).sort());
  });

  it("looks at the tree it claims to", () => {
    // The scan is core's. Naming the root here means a later edit that
    // narrows it — to `components/`, say — is a failure rather than a
    // quieter green.
    expect(relative(REPO_ROOT, CORE_ROOT)).toBe("frontend/src");
    expect(sourceFiles(CORE_ROOT).length).toBeGreaterThan(200);
  });

  it.each([
    ["mousedown", "document"],
    ["pointerdown", "document"],
    ["touchstart", "document"],
    ["mousedown", "window"],
  ])("still bites on a %s at %s", (event, target) => {
    // Guards the scan end to end rather than re-testing its regex: an
    // assertion of "only the exceptions" passes trivially once the walk
    // stops returning files.
    //
    // All three events and both scopes, because core happens to carry one
    // spelling today. `FilterField` carried the `touchstart` until this
    // change removed it, and a scan whose alternation has no live example
    // is a branch nothing would notice losing.
    const dir = mkdtempSync(join(tmpdir(), "popup-dismiss-scan-"));
    const file = join(dir, "Sample.tsx");
    writeFileSync(
      file,
      [
        "useEffect(() => {",
        "  const onDown = (e: MouseEvent) => {",
        "    if (!ref.current?.contains(e.target as Node)) setOpen(false);",
        "  };",
        `  ${target}.addEventListener("${event}", onDown);`,
        "});",
      ].join("\n"),
    );
    try {
      expect(outsidePressListeners([dir])).toEqual([
        `${relative(REPO_ROOT, file)}:5`,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not mistake a listener on an element for one on the document", () => {
    // The player's frame, the transcript list and the graph canvas all
    // bind a press. They are gestures on the element that got the press,
    // not "did this land outside my popup", and flagging them would push
    // the next author to allowlist rather than to look.
    const dir = mkdtempSync(join(tmpdir(), "popup-dismiss-scan-"));
    const file = join(dir, "Gesture.tsx");
    writeFileSync(
      file,
      'frame.addEventListener("pointerdown", revealControls);\n',
    );
    try {
      expect(outsidePressListeners([dir])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
