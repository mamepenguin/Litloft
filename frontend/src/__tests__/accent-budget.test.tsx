import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

import { FolderToolbar } from "@/components/folder/FolderToolbar";
import { RootFileListing } from "@/components/RootFileListing";
import type { FileItem } from "@/types";

/**
 * Stubbed, and it costs this file a blind spot worth naming: an addon
 * contributing a control to one of these screens spends from the same
 * budget, and the folder toolbar still draws `folder-actions` beside the
 * Add menu. No addon fills accent today (`FolderAIActionsButton` is
 * bordered), so what this counts is the core's own fills. Rendering an
 * addon's real component here would mean core tests importing addon code,
 * which the load order does not allow.
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
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/EmptyState", () => ({ EmptyState: () => <div /> }));
vi.mock("@/components/FileGrid", () => ({ FileGrid: () => <div data-testid="grid" /> }));
vi.mock("@/components/FileList", () => ({ FileList: () => <div data-testid="list" /> }));

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

/**
 * One accent fill per screen (DESIGN.md §2.2, 00-basis 原則 2).
 *
 * The folder toolbar carried three at once — upload, play-all and the
 * selected half of the view toggle — which is the state §2.2 describes as
 * "the screen has not decided what it is for". This holds the budget
 * mechanically, because a fourth is one `className` away and nothing else
 * in the tree would notice.
 *
 * **A fill at rest, not the token.** `bg-accent/10` is a tint behind a
 * hovered row and `bg-accent-teal` is a different colour, so neither is
 * this utility at all. Of the utility itself, what is excluded is a fill
 * that only paints in a transient *state* — `hover:`, `focus:`,
 * `active:`, `disabled:` and their kin. **Responsive and theme variants
 * are not excluded**: `sm:bg-accent` paints at rest on every desktop
 * width, which is the width this toolbar is designed at, and an earlier
 * draft of this rule waved it through by excluding every prefixed token
 * on the grounds that prefixed fills "only paint under a pointer" —
 * true of `hover:`, false of `sm:` and `dark:`.
 */
const ACCENT_FILLS = new Set(["bg-accent", "bg-accent-cta"]);

/**
 * Variants that make a fill conditional on a transient interaction.
 * Anything else — a breakpoint, a colour scheme, `print:` — still paints
 * with the control sitting there untouched.
 */
const STATE_VARIANTS =
  /^(hover|focus|focus-visible|focus-within|active|visited|target|disabled|enabled|group-hover|group-focus|peer-hover|peer-focus|aria-|data-)/;

function isRestingAccentFill(token: string): boolean {
  const parts = token.split(":");
  const utility = parts.pop() ?? "";
  if (!ACCENT_FILLS.has(utility)) return false;
  return !parts.some((variant) => STATE_VARIANTS.test(variant));
}

export function accentFills(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[class]")].filter((el) =>
    // `getAttribute`, not `el.className`: on an SVG element `className` is
    // an `SVGAnimatedString`, whose `toString()` is the literal
    // "[object SVGAnimatedString]". lucide passes `className` straight to
    // its `<svg>`, so a fill put on an icon read as no classes at all.
    (el.getAttribute("class") ?? "").split(/\s+/).some(isRestingAccentFill),
  );
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
 * The screens under the budget, named here so the set cannot be narrowed
 * by choosing what to render. Phase 3 B2c adds the remaining five — Trash,
 * Missing, a collection, Ask and Find — plus Media Import in C1, and the
 * list is the record of that.
 *
 * The drive root is here rather than in B2c because it draws the same
 * three controls as the folder toolbar from its own copy of the markup,
 * and a rule stated in `DESIGN.md` while a screen this PR edits breaks it
 * is not a rule.
 */
const SCREENS = ["folder toolbar", "drive root"] as const;

describe("accent budget", () => {
  afterEach(cleanup);

  it("covers the screens it says it covers", () => {
    expect([...SCREENS]).toEqual(["folder toolbar", "drive root"]);
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
