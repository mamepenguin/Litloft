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
 * Every popup in core is dismissed by `DismissScrim`, which answers the
 * press and swallows the click that press produces.
 *
 * Core only: an exact population cannot be stated across a pinned
 * submodule, whose checked-out tree may predate the addon's own fix.
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
      // `frontend/src/addons/*` links the submodules in.
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

/** A comment that quotes a needle describes a popup rather than declaring one. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/**
 * What a popup *is* (its ARIA, or geometry hung off its trigger), not how it
 * dismisses: dismissal is the property being fixed, so the broken popups are
 * exactly the ones a dismissal-shaped needle misses.
 *
 * A popup with no ARIA positioned only by inline coordinates is not found,
 * nor is a modal without `role="dialog"`.
 */
const NEEDLES = [
  'role="menu"',
  'role="menuitem',
  'role="listbox"',
  'role="option"',
  'role="dialog"',
  "aria-haspopup",
  "top-full",
  "bottom-full",
  "useMenuSurface",
  "ANCHORED_VERTICAL",
] as const;

const POPUP_NEEDLE = new RegExp(NEEDLES.join("|"));

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
  "frontend/src/components/EditableTagChips.tsx": {
    dismissedIn: "frontend/src/components/EditableTagChips.tsx",
    why:
      "the tag suggestion list. It declares no ARIA of its own beyond a " +
      "label and dismissed on the input's `onBlur`, so it was invisible to " +
      "every guard that asked how a popup closes — it is here because of " +
      "the `top-full` it is drawn with",
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
  "frontend/src/hooks/useAnchoredDirection.ts": {
    dismissedIn: null,
    why:
      "not a popup — the module every anchored popup takes its direction " +
      "from. It is in the population because `ANCHORED_VERTICAL` spells " +
      "`top-full` and `bottom-full` for its callers, which is the same " +
      "reason `ActionMenuItem` is here for a role it only declares",
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

  // Modal surfaces: each paints its own full-viewport backdrop, so nothing
  // behind it can take a stray click.
  "frontend/src/app/admin/settings/DrivesSection.tsx": {
    dismissedIn: null,
    why: "modal dialogs with their own backdrop",
  },
  "frontend/src/app/admin/settings/PasswordsSection.tsx": {
    dismissedIn: null,
    why: "modal dialogs with their own backdrop",
  },
  "frontend/src/components/FileSaveDialog.tsx": {
    dismissedIn: null,
    why: "a modal dialog; it hosts FolderPicker, which brings its own scrim",
  },
  "frontend/src/components/ImageGallery.tsx": {
    dismissedIn: null,
    why: "an immersive viewer — it replaces the page and marks the rest inert",
  },
  "frontend/src/components/ShortcutCheatSheet.tsx": {
    dismissedIn: null,
    why: "a modal dialog with its own backdrop",
  },
  "frontend/src/components/archive/ArchiveImageViewer.tsx": {
    dismissedIn: null,
    why: "an immersive viewer — it replaces the page and marks the rest inert",
  },
  "frontend/src/components/quick-note/QuickNotePresenter.tsx": {
    dismissedIn: null,
    why: "a modal dialog; it hosts FolderPicker, which brings its own scrim",
  },
};

/**
 * `click` belongs here as much as the press: at window scope the popup
 * closes and the element under the finger still receives the same click.
 *
 * An alias (`const d = document; d.addEventListener(…)`) is not caught.
 */
const GLOBAL_POINTER_LISTENER =
  /\b(?:document|window|document\.body)\.addEventListener\(\s*["'](?:click|mousedown|pointerdown|touchstart|mouseup|pointerup|touchend)["']/g;

function globalPointerListeners(roots: string[] = [CORE_ROOT]): string[] {
  const found: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf-8");
      const rel = relative(REPO_ROOT, file);
      for (const m of text.matchAll(GLOBAL_POINTER_LISTENER)) {
        found.push(`${rel}:${text.slice(0, m.index!).split("\n").length}`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/**
 * Enumerated rather than excluded by a pattern: "it is only a drag" is what
 * a dismissal added to one of these files would look like from a distance.
 */
const GLOBAL_POINTER_EXCEPTIONS: Record<string, string> = {
  "frontend/src/components/DismissScrim.tsx":
    "the primitive itself, and the only listener of this shape that is " +
    "allowed to dismiss. It answers the press *and* swallows the click " +
    "that press produces — the two halves are one mechanism, and a popup " +
    "that writes half of it by hand is what every other name here would " +
    "be.",
  "frontend/src/components/VideoPreview.tsx":
    "the end of a drag, not of a popup. A seek begun on the scrubber is " +
    "followed to wherever the pointer goes, so `mousemove` / `mouseup` " +
    "are at window scope; nothing is dismissed and the click that ends " +
    "the drag belongs to the scrubber.",
  "frontend/src/components/player/MediaControls/hooks/usePlayerGestures.ts":
    "the same shape for a press on the player: `pointerup` / " +
    "`pointercancel` end a gesture that started on the surface, and the " +
    "tap they classify is the player's own.",
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

  it("keeps its geometry needle load-bearing", () => {
    const ariaNeedles = NEEDLES.filter(
      (n) => n.startsWith("role=") || n.startsWith("aria-"),
    );
    const strip = (rel: string) =>
      ariaNeedles.reduce(
        (text, needle) => text.split(needle).join("__none__"),
        withoutComments(read(rel)),
      );

    const measured = strip("frontend/src/components/EditableTagChips.tsx");
    for (const needle of ariaNeedles) expect(measured).not.toContain(needle);
    expect(measured).toContain("ANCHORED_VERTICAL");
    expect(POPUP_NEEDLE.test(measured)).toBe(true);

    const declared = strip("frontend/src/components/SelectionBar.tsx");
    expect(declared).toContain("bottom-full");
    expect(POPUP_NEEDLE.test(declared)).toBe(true);
  });

  it("sees a popup that reuses the shared menu surface", () => {
    const dir = mkdtempSync(join(tmpdir(), "popup-surface-"));
    const file = join(dir, "Sixth.tsx");
    // No `import` line: `toolbarMenuHome.test.ts` enumerates the files that
    // import the module, and would count this one.
    writeFileSync(
      file,
      "export const Sixth = () => {\n" +
        "  const surface = useMenuSurface(open);\n" +
        "  return <div className={surface.className}><button>row</button></div>;\n" +
        "};\n",
    );
    try {
      expect(popupFiles([dir])).toEqual([relative(REPO_ROOT, file)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defines its population in one place", () => {
    expect(NEEDLES).toHaveLength(10);
  });

/**
 * Written out rather than derived from the needle by string surgery: a
 * derived declaration still contains its needle after it stops resembling
 * anything a real trigger writes.
 */
const NEEDLE_DECLARATIONS: Record<(typeof NEEDLES)[number], string> = {
  'role="menu"': 'role="menu"',
  'role="menuitem': 'role="menuitemradio"',
  'role="listbox"': 'role="listbox"',
  'role="option"': 'role="option"',
  'role="dialog"': 'role="dialog"',
  "aria-haspopup": 'aria-haspopup="menu"',
  "top-full": 'className="absolute top-full"',
  "bottom-full": 'className="absolute bottom-full"',
  useMenuSurface: "const surface = useMenuSurface(open);",
  ANCHORED_VERTICAL: "className={ANCHORED_VERTICAL[1].down}",
};

  it("has a declaration for every needle", () => {
    expect(Object.keys(NEEDLE_DECLARATIONS).sort()).toEqual([...NEEDLES].sort());
  });

  it.each(
    NEEDLES.map((needle) => [needle, NEEDLE_DECLARATIONS[needle]]),
  )("is found by %s", (needle, declaration) => {
    expect(declaration).toContain(needle);

    const dir = mkdtempSync(join(tmpdir(), "popup-needle-"));
    const file = join(dir, "Sample.tsx");
    writeFileSync(file, `export const x = <div ${declaration} />;\n`);
    try {
      expect(popupFiles([dir])).toEqual([relative(REPO_ROOT, file)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["a line comment", '// role="menu" is what a menu panel declares\nexport const x = 1;\n'],
    ["a block comment", '/* role="menu" */\nexport const x = 1;\n'],
    [
      "a JSDoc block",
      '/**\n * Rows inside a `role="menu"` must be menuitems.\n */\nexport const x = 1;\n',
    ],
  ])("is not declared by %s", (_label, source) => {
    const dir = mkdtempSync(join(tmpdir(), "popup-comment-"));
    const file = join(dir, "Prose.tsx");
    writeFileSync(file, source);
    try {
      expect(popupFiles([dir])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still sees a declaration on a line that also carries a comment", () => {
    const dir = mkdtempSync(join(tmpdir(), "popup-comment-"));
    const file = join(dir, "Menu.tsx");
    writeFileSync(file, 'export const x = <div role="menu" />; // the panel\n');
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

/**
 * No z-index tier is asserted: `DismissScrim` does not need the scrim to be
 * hit, and a whitelist of stacking positions loses to the next arrangement.
 */

describe("An outside press", () => {
  it("is answered in one place, and nowhere by hand", () => {
    expect(
      [
        ...new Set(
          globalPointerListeners().map((hit) => hit.replace(/:\d+$/, "")),
        ),
      ].sort(),
    ).toEqual(Object.keys(GLOBAL_POINTER_EXCEPTIONS).sort());
  });

  it("looks at the whole tree it claims to", () => {
    // Adding or deleting any source file under `frontend/src` changes this
    // number.
    expect(relative(REPO_ROOT, CORE_ROOT)).toBe("frontend/src");
    expect(sourceFiles(CORE_ROOT).length).toBe(444);
  });

  it.each([
    ["click", "window"],
    ["click", "document"],
    ["mousedown", "document"],
    ["pointerdown", "document"],
    ["touchstart", "document"],
    ["mouseup", "document"],
    ["pointerup", "document"],
    ["touchend", "document"],
    ["mousedown", "window"],
    ["pointerdown", "document.body"],
  ])("still bites on a %s at %s", (event, target) => {
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
      expect(globalPointerListeners([dir])).toEqual([
        `${relative(REPO_ROOT, file)}:5`,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not mistake a listener on an element for one on the document", () => {
    const dir = mkdtempSync(join(tmpdir(), "popup-dismiss-scan-"));
    const file = join(dir, "Gesture.tsx");
    writeFileSync(
      file,
      'frame.addEventListener("pointerdown", revealControls);\n',
    );
    try {
      expect(globalPointerListeners([dir])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * Nothing drawn inside the Bottom Sheet or its resting strip may spell the
 * `fixed … bottom-4` form; a third file here is a decision to make.
 */
describe("the pinned-to-the-screen menu form", () => {
  const SHEET_FORM = /fixed inset-x-2 bottom-4/;

  function filesSpellingSheetForm(): string[] {
    const out: string[] = [];
    for (const file of sourceFiles(CORE_ROOT)) {
      if (SHEET_FORM.test(withoutComments(readFileSync(file, "utf-8")))) {
        out.push(relative(REPO_ROOT, file));
      }
    }
    return out.sort();
  }

  it("is spelled in the two bar menus and nowhere else in core", () => {
    expect(filesSpellingSheetForm()).toEqual([
      "frontend/src/components/SortButton.tsx",
      "frontend/src/components/ToolbarMenu.tsx",
    ]);
  });
});
