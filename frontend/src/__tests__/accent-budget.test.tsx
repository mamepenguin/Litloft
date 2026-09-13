import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripComments } from "./helpers/sourceScan";

import { DriveHome } from "@/components/DriveHome";
import { EmptyState } from "@/components/EmptyState";
import { FolderBrowser } from "@/components/FolderBrowser";
import { FolderToolbar } from "@/components/folder/FolderToolbar";
import { SelectionBar } from "@/components/SelectionBar";
import type { FileItem } from "@/types";
import { accentFills } from "./helpers/accentFills";

/**
 * Stubbed because `frontend/src/addons/*` is a gitignored link tree, so a
 * core assertion about an addon's pixels would pass or fail on what a
 * checkout happens to hold.
 */
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

// `Button` and `AddButton` are deliberately real — they are what is being
// measured.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ name: "main" }),
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
vi.mock("@/components/FileGrid", () => ({ FileGrid: () => <div data-testid="grid" /> }));
vi.mock("@/components/FileList", () => ({ FileList: () => <div data-testid="list" /> }));

const mockClipboard: { clipboard: unknown } = { clipboard: null };
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ ...mockClipboard, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isCut: () => false }),
}));
// `hasProfile` gates both watch-history rows out of the tree, and their
// cards draw a `bg-accent` progress bar, so `mockProfile` is mutable.
const mockProfile = { nickname: null as string | null };
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({
    nickname: mockProfile.nickname,
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ isOpen: false, toggle: vi.fn(), close: vi.fn(), refreshKey: 0, requestRefresh: vi.fn() }),
}));
vi.mock("@/hooks/useDragAndDrop", () => ({
  useDragAndDrop: () => ({
    dragState: { isDragging: false, draggedFolderPath: null, draggedFileIdSet: new Set() },
    handleDragStart: vi.fn(),
    handleFolderDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    getDropTargetProps: vi.fn(),
    isDropTarget: () => false,
    isDropDisabled: () => false,
  }),
}));
vi.mock("@/components/ConfirmDialog", () => ({ ConfirmDialog: () => null }));
vi.mock("@/components/MoveDialog", () => ({ MoveDialog: () => null }));
vi.mock("@/components/CollectionPicker", () => ({ CollectionPicker: () => null }));
vi.mock("@/components/BatchRenameDialog", () => ({ BatchRenameDialog: () => null }));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
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
    getFolders: vi.fn().mockResolvedValue([]),
    getPins: vi.fn().mockResolvedValue([]),
    getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
    addPin: vi.fn(),
    removePin: vi.fn(),
    deleteFile: vi.fn(),
    renameFile: vi.fn(),
    moveFile: vi.fn(),
    getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
    getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
    getStreamUrl: (id: string) => `/api/files/${id}/stream`,
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
    image_width: null,
    image_height: null,
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
  isWriteDestination: true,
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
 * Ask, Find and Media Import are absent on purpose: they are addon-owned
 * pages, counted in their own repositories.
 */
const SCREENS: ReadonlyArray<{ screen: string; assertedIn: string }> = [
  { screen: "root drive picker", assertedIn: "src/app/__tests__/page.test.tsx" },
  { screen: "admin dashboard", assertedIn: "src/app/admin/__tests__/AdminDashboard.test.tsx" },
  {
    screen: "admin markdown-images",
    assertedIn: "src/app/admin/markdown-images/__tests__/MarkdownImagesPresenter.test.tsx",
  },
  // Three files, because the page-level test mocks the three section
  // components out to measure its own chrome.
  { screen: "admin settings — chrome", assertedIn: "src/app/admin/settings/__tests__/SettingsPage.test.tsx" },
  { screen: "admin settings — drives", assertedIn: "src/app/admin/settings/__tests__/DrivesSection.test.tsx" },
  { screen: "admin settings — passwords", assertedIn: "src/app/admin/settings/__tests__/PasswordsSection.test.tsx" },
  { screen: "personal settings", assertedIn: "src/app/settings/__tests__/page.test.tsx" },
  { screen: "folder toolbar", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "drive root", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "Library root", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "selection bar over a folder", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "trash", assertedIn: "src/components/__tests__/TrashMissingHeader.test.tsx" },
  { screen: "missing", assertedIn: "src/components/__tests__/TrashMissingHeader.test.tsx" },
  { screen: "collection", assertedIn: "src/components/__tests__/CollectionDetail.test.tsx" },
  { screen: "empty folder", assertedIn: "src/__tests__/accent-budget.test.tsx" },
  { screen: "file detail — no preview", assertedIn: "src/components/__tests__/FilePreview.test.tsx" },
  { screen: "search modal", assertedIn: "src/components/__tests__/GlobalSearch.test.tsx" },
];

beforeEach(() => {
  mockClipboard.clipboard = null;
});

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
    // A named group or peer.
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

  it("covers seventeen core screens, and each one somewhere that runs", () => {
    expect(SCREENS.map((s) => s.screen)).toEqual([
      "root drive picker",
      "admin dashboard",
      "admin markdown-images",
      "admin settings — chrome",
      "admin settings — drives",
      "admin settings — passwords",
      "personal settings",
      "folder toolbar",
      "drive root",
      "Library root",
      "selection bar over a folder",
      "trash",
      "missing",
      "collection",
      "empty folder",
      "file detail — no preview",
      "search modal",
    ]);
    const root = resolve(__dirname, "..", "..");
    for (const { screen: name, assertedIn } of SCREENS) {
      const source = stripComments(readFileSync(resolve(root, assertedIn), "utf8"));
      expect(
        /expect\(\s*accentFills\(/.test(source),
        `${name}: ${assertedIn} never passes accentFills to an expect`,
      ).toBe(true);
      // Not `\.(skip|only)\s*\(`: `it.skipIf(true)(...)` has `If` between
      // the name and the parenthesis.
      expect(
        /\.(skip|only|runIf|todo)[A-Za-z]*\s*[(<]/.test(source),
        `${name}: ${assertedIn} disables or narrows its own tests`,
      ).toBe(false);
    }
  });

  describe("folder toolbar", () => {
    // The toolbar draws its left group once for each breakpoint, so labels
    // are counted rather than nodes.
    const fillLabels = (root: HTMLElement) =>
      [...new Set(accentFills(root).map((el) => el.textContent?.trim() ?? ""))];

    it("spends its one fill on Add, in an ordinary folder", () => {
      const { container } = render(<FolderToolbar {...folderProps} />);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one when the folder can be played", () => {
      const { container } = render(
        <FolderToolbar {...folderProps} hasPlayableFiles />,
      );
      expect(screen.getAllByRole("button", { name: "Play" }).length).toBeGreaterThan(0);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one while a folder is being named", () => {
      const { container } = render(
        <FolderToolbar {...folderProps} creatingFolder />,
      );
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one when the folder is empty", () => {
      const { container } = render(
        <>
          <FolderToolbar {...folderProps} />
          <EmptyState
            variant="no-files"
            secondaryActions={[
              { label: "Add files", onClick: () => undefined },
              { label: "New note", onClick: () => undefined },
            ]}
          />
        </>,
      );
      expect(screen.getByRole("button", { name: "Add files" })).toBeInTheDocument();
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one when a tag filter matched nothing", () => {
      const { container } = render(
        <>
          <FolderToolbar {...folderProps} />
          <EmptyState
            variant="no-tag-matches"
            secondaryActions={[{ label: "Search the whole drive", href: "/drive/family?tag=x" }]}
          />
        </>,
      );
      expect(screen.getByRole("link", { name: "Search the whole drive" })).toBeInTheDocument();
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("spends none in search mode, where nothing can be added", () => {
      const { container } = render(
        <FolderToolbar {...folderProps} isSearch isWriteDestination={false} />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });

    it("still spends only one with the selection bar up", () => {
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
          isWriteDestination={false}
          total={0}
          folderCount={0}
        />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });
  });
});

describe("accent budget — Library root", () => {
  beforeEach(() => {
    mockGetDriveFiles.mockReset();
    mockGetDriveFiles.mockResolvedValue({ data: [playableFile()], meta: { total: 1 } });
    localStorage.clear();
  });
  afterEach(cleanup);

  const fillLabels = (root: HTMLElement) =>
    [...new Set(accentFills(root).map((el) => el.textContent?.trim() ?? ""))];

  it("spends its one fill on Add", async () => {
    const { container } = render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    await screen.findAllByRole("button", { name: "Add" });
    // Two, because the toolbar renders its left group once for each
    // breakpoint.
    expect(accentFills(container)).toHaveLength(2);
    expect(fillLabels(container)).toEqual(["Add"]);
  });

  it("spends two while the clipboard is full, which §2.2 does not allow", () => {
    // This records a defect, not a rule, and goes red when the defect is
    // fixed on purpose: `Paste here` is drawn `variant="primary"`.
    mockClipboard.clipboard = { fileIds: ["f1"], drive: "main", path: "recipes", mode: "copy" };
    const { container } = render(<FolderBrowser driveName="main" folderPath="" view="library" />);
    expect(fillLabels(container)).toEqual(["Add", "Paste here"]);
  });

  it("spends two at a named folder as well, which is what makes it general", () => {
    mockClipboard.clipboard = { fileIds: ["f1"], drive: "main", path: "other", mode: "copy" };
    const { container } = render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(fillLabels(container)).toEqual(["Add", "Paste here"]);
  });
});

describe("accent budget — drive root", () => {
  beforeEach(() => {
    mockGetDriveFiles.mockReset();
    mockGetDriveFiles.mockResolvedValue({ data: [playableFile()], meta: { total: 1 } });
    mockGetWatchHistory.mockReset();
    mockGetWatchHistory.mockResolvedValue([]);
    mockProfile.nickname = null;
  });
  afterEach(cleanup);

  it("spends its one fill on Add, with content rows on screen", async () => {
    const { container } = render(<DriveHome driveName="main" />);
    // Three: the rows that carry a count are Recently added, Favourites
    // and Liked.
    expect(await screen.findAllByText(/See all \(1\)/)).toHaveLength(3);
    expect(
      [...new Set(accentFills(container).map((el) => el.textContent?.trim() ?? ""))],
    ).toEqual(["Add"]);
  });

  it("puts Add in the header", async () => {
    render(<DriveHome driveName="main" />);
    const add = await screen.findByRole("button", { name: "Add" });
    expect(add.closest("header")).not.toBeNull();
  });

  it("still spends one on Add with a half-watched row on screen", async () => {
    // A watch-progress bar is a resting `bg-accent`, but a mark rather than
    // a control: it carries no name and is sized by an inline width.
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([
      { ...playableFile(), watch_progress: { position: 30, duration: 120 } },
    ]);

    const { container } = render(<DriveHome driveName="main" />);
    await screen.findByRole("button", { name: "Add" });
    await screen.findByText("Continue Watching");

    const fills = accentFills(container);
    const controls = fills.filter((el) => el.textContent?.trim());
    expect(controls.map((el) => el.textContent!.trim())).toEqual(["Add"]);

    const marks = fills.filter((el) => !el.textContent?.trim());
    // Two rows read the same history: Continue watching and Recently
    // played.
    expect(marks.length).toBe(2);
    for (const mark of marks) {
      expect((mark as HTMLElement).style.width).not.toBe("");
    }
  });

});
