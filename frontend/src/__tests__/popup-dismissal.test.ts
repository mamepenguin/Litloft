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
 * Every popup in core is dismissed by one primitive.
 *
 * Three behaviours coexisted here, and two of them handed the click
 * through to whatever was under the finger:
 *
 *  - a `document` listener on `mousedown` / `pointerdown` / `touchstart`,
 *    which answers on the *press* and leaves the element underneath as
 *    the target of the `click` that follows;
 *  - a scrim dismissed on `pointerDown`, which unmounts itself before the
 *    tap's `click` is dispatched and so hit-tests to the same place;
 *  - a scrim dismissed on its own `click`, which was right only while the
 *    scrim was what the tap reached — a claim about stacking that lost
 *    three times running.
 *
 * `DismissScrim` now answers the press **and swallows the click that
 * press produces**, so no popup depends on where its scrim is painted.
 *
 * A mouse hides the first two: cancelling `pointerdown` suppresses the
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
 * It claims that the population is enumerated, that each member goes
 * through `DismissScrim`, and that nothing else in core answers a
 * document-level press — a spelling check over source text, run in node
 * with nothing rendered. It claims nothing about the mechanism itself:
 * that a press outside dismisses, that the click it produces is taken
 * once, and that the control underneath is spared, is
 * `DismissScrim.test.tsx`'s, and the same outcome under real stacking is
 * measured with a real touch in Chromium by
 * `e2e-layout/popup-dismiss.spec.ts`.
 *
 * **No tier is asserted here any longer.** See the paragraph above
 * `An outside press` for what three rounds of trying cost.
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
 *
 * Two branches, and each has a case below whose only match it removes. A
 * third — dropping lines that begin with `*` — was here and is gone: the
 * block strip already takes every JSDoc line, so nothing could tell the
 * two apart and either one could be deleted with the suite green. A
 * branch no case needs is not a guard.
 */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/**
 * What a popup **is**, in two independent spellings.
 *
 * Earlier rounds defined this population by how a popup dismissed itself —
 * an ARIA declaration, then a global pointer listener — and each round a
 * popup was missed. The reason is structural: dismissal is the property
 * being *fixed*, so the broken ones are exactly the ones that do not match
 * the definition. `EditableTagChips`'s tag suggestions were the fifth, and
 * they escaped all three guards at once: no ARIA beyond an `aria-label`,
 * no `document` listener (an `onBlur` and a `setTimeout` instead), and no
 * scrim for the reverse scan to find.
 *
 * So these say what a popup *is*:
 *
 *  - **It says it is one.** The ARIA a popup surface declares, plus the
 *    attribute its trigger carries. `role="menuitem` is a prefix, so
 *    `menuitemradio` and `menuitemcheckbox` ride on it — ended at the
 *    quote it missed the spelling this unit itself introduced.
 *  - **It hangs off its trigger.** `top-full` / `bottom-full` is how an
 *    anchored surface is drawn against the edge of the control that opened
 *    it. It is geometry, not behaviour, so no dismissal style can hide it,
 *    and it is what catches a popup that declares nothing.
 *
 * Wider than "things that render a scrim" on purpose: it also catches a
 * menu *row*, a modal dialog, and a file that only opens someone else's
 * panel, so each of those is named below with where its dismissal lives.
 *
 * **The limit, stated properly this time.** An earlier version of this
 * paragraph said the only gap was "no ARIA *and* positioned by inline
 * coordinates", and that was wrong: every modal dialog with a hand-rolled
 * `fixed inset-0` backdrop and no `role` is outside these needles too —
 * `ConfirmDialog`, `MoveDialog`, `RenameDialog`, `CollectionPicker`,
 * `GlobalSearch` and the rest. Which modals are in the population is an
 * accident of which ones happen to spell `role="dialog"`.
 *
 * That is tolerable only because a modal is a different pattern: it paints
 * its own backdrop over the whole viewport, dismisses on that backdrop's
 * `click`, and has nothing behind it a stray click could reach. The
 * population this file guards is **anchored popups** — a surface hung off
 * a control, with a live page behind it. A modal that grows an anchored
 * menu inside it is caught by the menu, not by the modal.
 *
 * A popup declaring no ARIA and positioned only by inline coordinates is
 * still invisible here. `ContextMenu` is that shape and is in by its rows'
 * `role="menuitem"`; one written with neither would be missed.
 *
 * **The array is the definition.** `POPUP_NEEDLE` is joined from it and the
 * cases below iterate it, so a spelling cannot leave the alternation while
 * its case quietly goes too — measured: deleting `role="listbox"` and
 * `role="option"` from the regex *and* from a hand-written case list left
 * the file green.
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
  "MENU_SURFACE",
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

  // Modal surfaces. They arrive with `role="dialog"` in the needle set,
  // and they are not anchored popups: each paints its own backdrop over
  // the whole viewport and is dismissed by that backdrop or by Escape,
  // with nothing behind it a stray click could reach. Enumerated rather
  // than excluded by a path rule, so a dialog that grows a menu inside it
  // is already named here.
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
 * A `document`- or `window`-level pointer listener.
 *
 * The event, not the handler's body: a pointer listener at this scope
 * either belongs to the one primitive that dismisses popups, or is one of
 * the enumerated exceptions, or is a popup closing itself by hand — which
 * is the defect. A listener on a specific element is a gesture on that
 * element and is not in scope.
 *
 * **`click` is in the alternation, and it is the one that matters most.**
 * A hand-written press listener is obviously wrong: it answers before the
 * click, so the click lands on whatever is underneath. A `click` listener
 * at this scope *looks* right and fails the same way, because `window` is
 * not in front of anything — the popup closes and the element under the
 * finger receives the very same click. That is what the sidebar's
 * collection menu did, and it declared no ARIA at all, so this scan is the
 * only thing that could have named it.
 *
 * `DismissScrim` now answers the press here too, and the difference is
 * the second half it carries with it: it takes the click that press
 * produces, once, before anything else can see it. That is the whole of
 * why the exception below is not the defect, and it is pinned in
 * `DismissScrim.test.tsx` — remove the swallow and that file goes red,
 * which is what makes this entry an exception rather than a hole.
 */
const GLOBAL_POINTER_LISTENER =
  /\b(?:document|window)\.addEventListener\(\s*["'](?:click|mousedown|pointerdown|touchstart)["']/g;

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
 * The listeners that are not popup dismissals, with the reason each one
 * is a press rather than a click.
 *
 * Paths only, since the scan reports a line and an edit above one of
 * these should not have to be paid for here. A file may hold more than
 * one — `FilterField` carried a `mousedown` and a `touchstart` for the
 * same popup — so what is compared is the set of files.
 */
const GLOBAL_POINTER_EXCEPTIONS: Record<string, string> = {
  "frontend/src/components/DismissScrim.tsx":
    "the primitive itself, and the only listener of this shape that is " +
    "allowed to dismiss. It answers the press *and* swallows the click " +
    "that press produces — the two halves are one mechanism, and a popup " +
    "that writes half of it by hand is what every other name here would " +
    "be.",
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
    // The claim this unit was re-opened to make good is that geometry —
    // not a dismissal style, and not ARIA — is what finds a popup that
    // declares nothing. As first shipped it was false: every file the
    // geometry matched also carried an ARIA needle, so deleting both
    // geometry spellings left the population byte-identical.
    //
    // This asserts the redundancy directly, on the real file rather than a
    // synthetic one: strip every ARIA needle from `EditableTagChips` and
    // it must still be a popup. Respelling its `top-full`, or dropping the
    // needle, fails here.
    const ariaNeedles = NEEDLES.filter(
      (n) => n.startsWith("role=") || n.startsWith("aria-"),
    );
    const stripped = ariaNeedles.reduce(
      (text, needle) => text.split(needle).join("__none__"),
      withoutComments(read("frontend/src/components/EditableTagChips.tsx")),
    );
    for (const needle of ariaNeedles) expect(stripped).not.toContain(needle);
    expect(POPUP_NEEDLE.test(stripped)).toBe(true);
  });

  it("sees a popup that reuses the shared menu surface", () => {
    // Five menus here render `className={MENU_SURFACE}` — the identifier,
    // not the classes — so the geometry inside it belongs to
    // `ToolbarMenu.tsx` and no consumer matches on it. All five happen to
    // also write `role="menu"`; a sixth would not have to. A probe of
    // exactly that shape was in the population of nothing until
    // `MENU_SURFACE` became a needle of its own.
    const dir = mkdtempSync(join(tmpdir(), "popup-surface-"));
    const file = join(dir, "Sixth.tsx");
    // The probe does not write the `import` line a real caller would.
    // `toolbarMenuHome.test.ts` enumerates the files that import
    // `MENU_SURFACE`, and it caught this file when the string was here —
    // an enumerating detector finding a new one, which is the shape
    // working. The needle is the identifier, so the probe still carries
    // what the sweep looks for.
    writeFileSync(
      file,
      "export const Sixth = () => (\n" +
        "  <div className={MENU_SURFACE}>\n" +
        "    <button>row</button>\n" +
        "  </div>\n" +
        ");\n",
    );
    try {
      expect(popupFiles([dir])).toEqual([relative(REPO_ROOT, file)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defines its population in one place", () => {
    // The count is here so that dropping a spelling is a failure rather
    // than a shorter list: the alternation and the cases below are built
    // from the same array, so an author trimming "branches with no live
    // example" removes both halves at once and nothing else objects.
    // Measured before this was joined from `NEEDLES`: deleting
    // `role="listbox"` and `role="option"` from the regex and from a
    // hand-written case list left the file green.
    // One literal, and it is the pin. A second assertion comparing
    // `POPUP_NEEDLE.source.split("|")` to `NEEDLES.length` was here and
    // could not fail: the regex is joined from the array on the line
    // above, so the two sides were the same observation.
    expect(NEEDLES).toHaveLength(9);
  });

/**
 * A whole, well-formed declaration for each needle.
 *
 * Written as a table rather than derived by string surgery: the derived
 * version produced `aria-haspopupradio"="menu"` for `aria-haspopup`,
 * because the branch that closes the `role="menuitem` prefix fired on it
 * too. The case still passed — a needle is a substring — so nothing said
 * the fixture had stopped containing anything a real trigger writes.
 *
 * The keys are checked against `NEEDLES` below, so a needle cannot be
 * added without a declaration to exercise it, and each case asserts that
 * the declaration it runs actually contains its own needle — without that
 * the table was pinned on neither axis: setting all nine values to
 * `role="menu"` left nine "is found by" cases green, eight of them
 * measuring a spelling they are not named for.
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
  MENU_SURFACE: "className={MENU_SURFACE}",
};

  it("has a declaration for every needle", () => {
    expect(Object.keys(NEEDLE_DECLARATIONS).sort()).toEqual([...NEEDLES].sort());
  });

  it.each(
    NEEDLES.map((needle) => [needle, NEEDLE_DECLARATIONS[needle]]),
  )("is found by %s", (needle, declaration) => {
    // Each spelling separately, against a tree written for it. Without a
    // case of its own a spelling is a branch that could be deleted with
    // every other assertion green — which is not hypothetical: two of
    // these were deleted from the regex and from a hand-written case list
    // in one edit, and the file stayed green. The cases are generated from
    // `NEEDLES` now, so that edit cannot be made in one hand.
    //
    // The needle first: the fixture landing in `popupFiles` says it is *a*
    // popup, never that this spelling is why. `role="menuitem` is a prefix
    // and is satisfied by `role="menuitemradio"`, which is what the
    // declaration writes.
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
    // One case per branch of `withoutComments`, because the branches were
    // individually deletable while the whole function was killed: the
    // only live evidence in core was one JSDoc block, and both branches
    // removed it. The single-line block form is what separates them — the
    // line filter does not touch it.
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
    // The other side of the same guard: stripping must not eat the code.
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

/**
 * The scrim's tier is not asserted anywhere, and that is the change.
 *
 * Three rounds of this file held a rule about `z`: a band, then a floor
 * read from the sticky bars, then a ceiling. Each was beaten by an
 * arrangement it had not foreseen — `z-[9]` under a tab strip, `z-10`
 * tying that strip and losing on document order, a `fixed bottom-0 z-50`
 * selection bar no scrim was allowed to clear, five scrims inside a
 * toolbar's own stacking context where every value behaves alike, and the
 * shared default which the rule skipped altogether.
 *
 * They were beaten because the rule was the wrong instrument, not because
 * it was written badly. `.claude/rules/review-workflow.md` says it under
 * "What a test here cannot hold": there is no bounded list of ways one box
 * ends up over another, so a whitelist of positions loses to the next
 * position.
 *
 * `DismissScrim` no longer needs the scrim to be hit, so no value of `z`
 * changes what a dismissing tap does. What replaced the rule is the
 * mechanism's own tests — `DismissScrim.test.tsx` for the event order,
 * `e2e-layout/popup-dismiss.spec.ts` for the same outcome measured in
 * Chromium with a real touch at four different stacking arrangements,
 * including the two this file's rules could not express.
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
    // The scan is core's, and it is the *whole* of core's.
    //
    // `toBe`, not a bound. This was `toBeGreaterThan(200)` against a real
    // population of 409, which tolerated losing half the tree — and a
    // plausible edit ("skip `app`, `hooks` and `lib`, there are no popups
    // in them") did exactly that with every assertion in this file still
    // green, because no member of `POPUPS` lives outside `components/`.
    // `review-workflow.md` rule 1 names that spelling directly.
    //
    // The cost is that adding or deleting any source file under
    // `frontend/src` edits this number — it went 409 to 410 when unit G
    // merged into this branch. That is the intended price: it is one line,
    // and the alternative is a guard that reads as a floor and functions
    // as nothing.
    expect(relative(REPO_ROOT, CORE_ROOT)).toBe("frontend/src");
    expect(sourceFiles(CORE_ROOT).length).toBe(410);
  });

  it.each([
    ["click", "window"],
    ["click", "document"],
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
      expect(globalPointerListeners([dir])).toEqual([
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
      expect(globalPointerListeners([dir])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
