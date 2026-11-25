/**
 * SPEC-CORE-178 I1 / I2 — which product files carry the fade-in entrance.
 * The four frequent surfaces carry none; every other file keeps the count it
 * had at the branch base.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

const BASELINE: Record<string, number> = {
  "components/AddButton.tsx": 1,
  "components/appshell/ManageTargetsDialog.tsx": 2,
  "components/BatchRenameDialog.tsx": 2,
  "components/CollectionPicker.tsx": 2,
  "components/ConfirmDialog.tsx": 2,
  "components/CopyIdDialog.tsx": 2,
  "components/ExifSection.tsx": 1,
  "components/FileSaveDialog.tsx": 2,
  "components/MoveDialog.tsx": 2,
  "components/NameInputDialog.tsx": 2,
  "components/player/MediaControls/GestureOverlay.tsx": 3,
  "components/RenameDialog.tsx": 2,
  "components/SelectionBar.tsx": 1,
  "components/SmartFolderSaveDialog.tsx": 2,
  "components/SortButton.tsx": 1,
  "components/ToolbarMenu.tsx": 1,
  "components/trash/TrashToolbar.tsx": 1,
};

const WITHOUT_ENTRANCE = [
  "components/ContextMenu.tsx",
  "components/GlobalSearch.tsx",
  "components/quick-note/QuickNotePresenter.tsx",
  "components/ShortcutCheatSheet.tsx",
];

/** `src/addons` holds addon checkouts, which their own diffs cover. */
function productFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path === join(SRC, "addons")) return [];
      return productFiles(path);
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\./.test(entry.name)) return [];
    return [path];
  });
}

function entranceCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const path of productFiles(SRC)) {
    const found = readFileSync(path, "utf8").match(/\banimate-fade-in(-scale)?\b/g);
    if (found) counts[relative(SRC, path)] = found.length;
  }
  return counts;
}

describe("SPEC-CORE-178 the fade-in entrance", () => {
  it("SPEC-CORE-178 I2 stays on every other file at its baseline count, and appears nowhere else", () => {
    expect(entranceCounts()).toEqual(BASELINE);
  });

  it("SPEC-CORE-178 I1 is gone from the palette, the cheat sheet, the quick note and the context menu", () => {
    const counts = entranceCounts();
    expect(WITHOUT_ENTRANCE.map((file) => [file, counts[file] ?? 0])).toEqual(
      WITHOUT_ENTRANCE.map((file) => [file, 0]),
    );
  });
});
