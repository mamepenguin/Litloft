import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripComments } from "./helpers/sourceScan";

import { FolderToolbar } from "@/components/folder/FolderToolbar";
import { RootFileListing } from "@/components/RootFileListing";
import { SelectionBar } from "@/components/SelectionBar";
import type { FileItem } from "@/types";
import { accentFills } from "./helpers/accentFills";

/**
 * Stubbed, and it costs this file a blind spot worth naming: an addon
 * contributing a control to a core screen spends from the same budget,
 * and the folder toolbar still draws `folder-actions` beside the Add
 * menu. `FolderAIActionsButton` is bordered, so nothing is over budget
 * today — but that is the addon's choice, not this file's guarantee.
 *
 * The stub is not a shortcut. `frontend/src/addons/*` is a set of
 * gitignored symlinks into the `addons/*` submodules, materialised by
 * `setup-addons.sh` (`.github/workflows/ci.yml`), so a core assertion
 * about an addon's pixels would pass or fail on what a checkout happens
 * to hold — the failure `button-adoption.test.ts` was already fixed for
 * once. Addon-owned screens are counted in the addon's own repository
 * instead.
 */
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

// Everything below is scaffolding for the drive root: it needs a router, a
// data source and a grid before it will draw its toolbar at all. `Button`
// and `AddButton` are deliberately real — they are what is being measured.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SortButton", () => ({ SortButton: () => <button>sort</button> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => <button>tree</button> }));
vi.mock("@/components/EmptyState", () => ({ EmptyState: () => <div /> }));
vi.mock("@/components/FileGrid", () => ({ FileGrid: () => <div data-testid="grid" /> }));
vi.mock("@/components/FileList", () => ({ FileList: () => <div data-testid="list" /> }));

vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/ConfirmDialog", () => ({ ConfirmDialog: () => null }));
vi.mock("@/components/MoveDialog", () => ({ MoveDialog: () => null }));
vi.mock("@/components/CollectionPicker", () => ({ CollectionPicker: () => null }));
vi.mock("@/components/BatchRenameDialog", () => ({ BatchRenameDialog: () => null }));

const mockGetDriveFiles = vi.fn();
vi.mock("@/lib/api", () => {
  class ApiStatusError extends Error {
    constructor(readonly status: number, message: string) {
      super(message);
      this.name = "ApiStatusError";
    }
  }
  return {
    ApiStatusError,
    getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
    scanDrive: vi.fn(),
    createFolder: vi.fn(),
    batchDelete: vi.fn(),
    batchGetFiles: vi.fn(),
    batchMove: vi.fn(),
    batchPurge: vi.fn(),
    batchRestore: vi.fn(),
    batchTag: vi.fn(),
  };
});

function playableFile(): FileItem {
  return {
    id: "f1", filename: "a.mp4", title: "a", description: "", drive: "main",
    folder_path: "", file_type: "video", mime_type: "video/mp4",
    thumbnail_url: "", has_thumbnail: false, file_size: 1, duration: 10,
    liked_at: null, is_favorite: false, tags: [], subtitles: [],
    deleted_at: null, missing_since: null, trust_tier: "verified",
    trust_reviewed_at: null, created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const folderProps = {
  isSpecialView: false,
  isFolderAnchored: true,
  tagFilter: null,
  hasPlayableFiles: false,
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 42,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["file-1"],
  drive: "test-drive",
  viewMode: "grid" as const,
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onTrustFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
  onCreateFile: vi.fn(),
  onReshuffle: vi.fn(),
};

/**
 * Every core screen under the budget, and the file that asserts it.
 *
 * Two of them are rendered below, where the setup is cheap. The rest are
 * asserted in their own test files, because reproducing a screen's mocks
 * in a second place is how two copies of a screen's setup start
 * disagreeing — `TrashView` alone needs eight. **A list of screens is
 * prose unless something checks it**, so this is a table rather than a
 * comment: each entry names a file, and that file must pass `accentFills`
 * to an `expect`, and must not have disabled itself with `.skip` or
 * narrowed itself with `.only`.
 *
 * **What this cannot prove.** It reads source; it does not watch the
 * assertion run. A named file that keeps the call but renders the wrong
 * thing satisfies it. The one hole that was demonstrated — an assertion
 * against a freshly created `<div>` — is closed inside `accentFills`,
 * which now refuses an empty root. The rest is what review is for, and
 * saying so here is cheaper than a claim that reads stronger than the
 * check.
 *
 * Ask, Find and Media Import are absent and are not omissions: they are
 * addon-owned pages, `frontend/src/addons/*` are gitignored symlinks that
 * `setup-addons.sh` materialises, and a core assertion about them passes
 * or fails on what a checkout happens to hold. They are counted in their
 * own repositories, in C1 and C2a — where the work is real, since Ask and
 * Find are accent-filled today (`intelligence/frontend/Page.tsx`,
 * `pages/find.tsx`).
 */
const SCREENS: ReadonlyArray<{ screen: string; assertedIn: string }> = [
  { screen: "folder toolbar", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "drive root", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "selection bar over a folder", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "trash", assertedIn: "src/components/__tests__/TrashMissingHeader.test.tsx" },
  { screen: "missing", assertedIn: "src/components/__tests__/TrashMissingHeader.test.tsx" },
  { screen: "collection", assertedIn: "src/components/__tests__/CollectionDetail.test.tsx" },
];

/**
 * The classifier, pinned directly.
 *
 * Reaching it only through a rendered screen means the table below is
 * whatever the screens happen to use, and every wrong entry two earlier
 * drafts had was a variant no screen used yet.
 */
describe("what counts as a fill at rest", () => {
  const has = (token: string) => {
    const el = document.createElement("div");
    el.setAttribute("class", token);
    const box = document.createElement("div");
    box.appendChild(el);
    return accentFills(box).length === 1;
  };

  it.each([
    // Plain, and variants that change nothing about being at rest.
    "bg-accent",
    "bg-accent-cta",
    "sm:bg-accent",
    "dark:bg-accent",
    "print:bg-accent",
    // Resting states that earlier drafts skipped. `enabled:` is the
    // complement of `disabled:` and is this repo's own idiom
    // (`Button.tsx` writes `enabled:hover:`); `disabled:bg-accent` is the
    // defect DESIGN.md §6 names; the `aria-`/`data-` families are mostly
    // selected-state, which §2.2 asks to be a border and not a fill.
    "enabled:bg-accent",
    "disabled:bg-accent",
    "visited:bg-accent",
    "target:bg-accent",
    "aria-selected:bg-accent",
    "aria-current:bg-accent",
    "aria-pressed:bg-accent",
    "data-[state=active]:bg-accent",
    "data-[theme=dark]:bg-accent",
    // Paints when the pointer is away — the resting half of a hover pair.
    "not-hover:bg-accent",
    // Relayed *resting* states, which the relay prefixes must not swallow.
    "group-data-[state=active]:bg-accent",
    "data-[state=hover]:bg-accent",
    // The row that makes the absent bracket-stripping step load-bearing:
    // with it, this reduces to `hover` and a resting fill goes unseen.
    "group-hover[x]:bg-accent",
    "peer-checked:bg-accent",
    "group-aria-selected:bg-accent",
  ])("counts %s", (token) => expect(has(token)).toBe(true));

  it.each([
    "hover:bg-accent",
    "focus:bg-accent",
    "focus-visible:bg-accent",
    "focus-within:bg-accent",
    "active:bg-accent",
    "group-hover:bg-accent",
    "peer-focus:bg-accent",
    "group-active:bg-accent",
    "has-hover:bg-accent",
    "in-hover:bg-accent",
    // Relays compose, so the prefix is stripped as many times as it is
    // written.
    "group-has-hover:bg-accent",
    // A named group or peer. Standard syntax, and the name used to make
    // the variant unrecognisable — a hover fill failing a build.
    "group-hover/sidebar:bg-accent",
    "peer-focus/email:bg-accent",
    // One interaction anywhere in the chain is enough.
    "sm:hover:bg-accent",
    "dark:group-hover:bg-accent",
  ])("does not count %s", (token) => expect(has(token)).toBe(false));

  it.each([
    "bg-accent/10",
    "bg-accent-hover",
    "bg-accent-teal",
    "border-accent",
    "text-accent",
  ])("does not count %s, which is not this fill at all", (token) =>
    expect(has(token)).toBe(false),
  );
});

describe("accent budget", () => {
  afterEach(cleanup);

  it("covers six core screens, and each one somewhere that runs", () => {
    expect(SCREENS.map((s) => s.screen)).toEqual([
      "folder toolbar",
      "drive root",
      "selection bar over a folder",
      "trash",
      "missing",
      "collection",
    ]);
    const root = resolve(__dirname, "..", "..");
    for (const { screen: name, assertedIn } of SCREENS) {
      const source = stripComments(readFileSync(resolve(root, assertedIn), "utf8"));
      expect(
        /expect\(\s*accentFills\(/.test(source),
        `${name}: ${assertedIn} never passes accentFills to an expect`,
      ).toBe(true);
      // Not `\.(skip|only)\s*\(`: `it.skipIf(true)(...)` has `If` between
      // the name and the parenthesis, and slipped through while disabling
      // one of the two screen assertions. Anything whose name *starts*
      // skip / only / runIf / todo counts.
      expect(
        /\.(skip|only|runIf|todo)[A-Za-z]*\s*[(<]/.test(source),
        `${name}: ${assertedIn} disables or narrows its own tests`,
      ).toBe(false);
    }
  });

  describe("folder toolbar", () => {
    // The toolbar draws its left group twice, once for each breakpoint, and
    // only one is visible — jsdom applies no stylesheet, so both are in the
    // tree. Counting distinct labels rather than nodes is what makes "one
    // fill" mean one control instead of one element.
    const fillLabels = (root: HTMLElement) =>
      [...new Set(accentFills(root).map((el) => el.textContent?.trim() ?? ""))];

    it("spends its one fill on Add, in an ordinary folder", () => {
      const { container } = render(<FolderToolbar {...folderProps} />);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one when the folder can be played", () => {
      // Play is a first-class action here and stays exposed (hako
      // `55N_yML35Q2jdVBsCxc06`), so this is the case where a second fill
      // used to appear.
      const { container } = render(
        <FolderToolbar {...folderProps} hasPlayableFiles />,
      );
      expect(screen.getAllByRole("button", { name: "Play" }).length).toBeGreaterThan(0);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one while a folder is being named", () => {
      // The inline Create button was a second fill, on the bar at the same
      // time as Add. Named rather than counted: `<= 1` would pass just as
      // well if Create were the one that survived and Add had lost its fill.
      const { container } = render(
        <FolderToolbar {...folderProps} creatingFolder />,
      );
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("spends none in search mode, where nothing can be added", () => {
      const { container } = render(
        <FolderToolbar {...folderProps} isSearch isFolderAnchored={false} />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });

    it("still spends only one with the selection bar up", () => {
      // The bar floats over the folder, so its own Apply button is on the
      // same screen as Add. It was a second fill.
      const { container } = render(
        <>
          <FolderToolbar {...folderProps} />
          <SelectionBar
            count={2}
            selectedIds={new Set(["a", "b"])}
            totalCount={5}
            drive="test-drive"
            currentPath=""
            onSelectAll={vi.fn()}
            onClear={vi.fn()}
            onComplete={vi.fn()}
          />
        </>,
      );
      fireEvent.click(screen.getByLabelText("Tagging"));
      expect(screen.getByText("Apply")).toBeInTheDocument();
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("spends none in an empty special view", () => {
      const { container } = render(
        <FolderToolbar
          {...folderProps}
          isSpecialView
          isFolderAnchored={false}
          total={0}
          folderCount={0}
        />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });
  });
});

describe("accent budget — drive root", () => {
  beforeEach(() => {
    mockGetDriveFiles.mockReset();
    mockGetDriveFiles.mockResolvedValue({ data: [playableFile()], meta: { total: 1 } });
  });
  afterEach(cleanup);

  it("spends its one fill on Add, with something playable in the drive", async () => {
    const { container } = render(<RootFileListing driveName="main" />);
    // Play only appears once the listing knows it holds something playable.
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(
      [...new Set(accentFills(container).map((el) => el.textContent?.trim() ?? ""))],
    ).toEqual(["Add"]);
  });

  it("still spends only one while a folder is being named", async () => {
    // The inline Create is the folder toolbar's twin, in this screen's own
    // copy of the markup. Reaching it means going through the Add menu,
    // which is the only way the row opens now.
    const { container } = render(<RootFileListing driveName="main" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByText("New Folder"));
    expect(screen.getByPlaceholderText("Folder name...")).toBeInTheDocument();
    expect(
      [...new Set(accentFills(container).map((el) => el.textContent?.trim() ?? ""))],
    ).toEqual(["Add"]);
  });
});
