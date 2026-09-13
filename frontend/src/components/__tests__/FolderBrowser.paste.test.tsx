/**
 * Which screens offer to paste, and which do nothing at all.
 *
 * Both halves per screen: the banner is what a reader sees, and `Cmd+V` is
 * what a reader with a keyboard reaches without it. A screen that hides the
 * banner and still pastes on the shortcut is the defect this is aimed at.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { FolderBrowser } from "../FolderBrowser";
import { useShortcuts } from "@/hooks/useShortcuts";

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => <nav /> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({ SmartFolderSaveButton: () => null }));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AddButton", () => ({ AddButton: () => <button>Add</button> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockPaste = vi.fn().mockResolvedValue(undefined);
// `ClipboardState`'s own field names. Spelled `drive`/`path`, every
// assertion about a real field read `undefined` and passed for the wrong
// reason.
type HeldClipboard = {
  fileIds: string[];
  mode: "copy" | "cut";
  sourceDrive: string;
  sourcePath: string;
};
const CLIPBOARD: HeldClipboard = {
  fileIds: ["f1", "f2"],
  mode: "copy",
  sourceDrive: "elsewhere",
  sourcePath: "other",
};
const held: { clipboard: HeldClipboard | null } = { clipboard: { ...CLIPBOARD } };
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    get clipboard() {
      return held.clipboard;
    },
    paste: (...args: unknown[]) => mockPaste(...args),
    clear: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    isCut: () => false,
  }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/hooks/useTreeEnabled", () => ({ useTreeEnabled: () => ({ enabled: false }) }));
vi.mock("@/lib/scrollContainer", () => ({ useScrollContainer: () => null }));
vi.mock("@/lib/listSnapshot", () => ({
  buildListSnapshotKey: () => "key",
  clearListSnapshot: vi.fn(),
  loadListSnapshot: () => null,
  saveListSnapshot: vi.fn(),
}));
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({ pinnedPaths: new Set<string>(), handleTogglePin: vi.fn() }),
}));
vi.mock("@/components/folder/useDriveScan", () => ({
  useDriveScan: () => ({ scanning: false, handleScan: vi.fn() }),
}));
vi.mock("@/components/folder/useCreateFolder", () => ({
  useCreateFolder: () => ({
    creatingFolder: false,
    newFolderName: "",
    folderError: null,
    setCreatingFolder: vi.fn(),
    setNewFolderName: vi.fn(),
    setFolderError: vi.fn(),
    handleCreateFolder: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));
vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [{ id: "a", file_type: "video" }],
    folders: [],
    total: 1,
    loading: false,
    loadingMore: false,
    hasMore: false,
    pagesLoaded: 1,
    sentinelRef: { current: null },
    reset: vi.fn(),
    setFiles: vi.fn(),
    setPaginatedTotal: vi.fn(),
    setFolders: vi.fn(),
    isRecent: false,
    hasProfile: false,
    snapshotKey: "key",
    hydratedScrollY: null,
  }),
}));
vi.mock("@/hooks/useFolderViewMode", () => ({
  useFolderSort: () => ({ sort: "title" as const, order: "asc" as const, setSort: vi.fn() }),
  useFolderViewMode: () => ({ viewMode: "list" as const, setViewMode: vi.fn() }),
}));

function pressPaste() {
  const groups = vi
    .mocked(useShortcuts)
    .mock.calls.filter((call) => call[3] === undefined || call[3] === true);
  const hit = groups
    .flatMap((call) => (Array.isArray(call[2]) ? call[2] : []))
    .find((s) => (s as { key?: string }).key === "ctrl+v") as
    | { handler: () => void }
    | undefined;
  if (!hit) throw new Error("no enabled shortcut registered for ctrl+v");
  hit.handler();
}

const pasteButtons = () => screen.queryAllByRole("button", { name: "Paste here" });

/**
 * Every screen `FolderBrowser` draws, with the props the route gives it.
 *
 * `folderPath` is `undefined` for a view and for a bare tag filter, and `""`
 * only where the route recognises the Library root — that difference is what
 * separates a tag applied at the root from one applied inside a folder.
 */
const SCREENS: ReadonlyArray<{
  name: string;
  props: Parameters<typeof FolderBrowser>[0];
  offersPaste: boolean;
  /** Declared, not read back off `props`: a derived expectation agrees with whatever the caller sent. */
  pastesInto?: string;
  /** Same, for the drive. A literal here cannot tell the prop from the constant. */
  pastesIntoDrive?: string;
}> = [
  {
    name: "a folder",
    props: { driveName: "main", folderPath: "recipes" },
    offersPaste: true,
    pastesInto: "recipes",
  },
  {
    name: "a folder under a tag",
    // On a second drive, so the assertion reads the prop rather than
    // agreeing with a constant every other row also happens to use.
    props: { driveName: "archive", folderPath: "recipes", tagFilter: "soup" },
    offersPaste: true,
    pastesInto: "recipes",
    pastesIntoDrive: "archive",
  },
  {
    name: "the Library root",
    props: { driveName: "main", folderPath: "", view: "library" },
    offersPaste: true,
    pastesInto: "",
  },
  {
    name: "the Library root under a tag",
    props: { driveName: "main", folderPath: "", view: "library", tagFilter: "soup" },
    offersPaste: false,
  },
  {
    name: "a tag applied at the drive root",
    props: { driveName: "main", tagFilter: "soup" },
    offersPaste: false,
  },
  { name: "Favourites", props: { driveName: "main", view: "favorites" }, offersPaste: false },
  { name: "Liked", props: { driveName: "main", view: "liked" }, offersPaste: false },
  { name: "Recently Viewed", props: { driveName: "main", view: "recent" }, offersPaste: false },
  {
    name: "Recently Added",
    props: { driveName: "main", view: "recent-added" },
    offersPaste: false,
  },
  { name: "All Files", props: { driveName: "main", view: "all" }, offersPaste: false },
  {
    name: "search results",
    props: { driveName: "main", searchQuery: "cake" },
    offersPaste: false,
  },
];

describe("where a clipboard can be pasted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    held.clipboard = { ...CLIPBOARD };
  });
  afterEach(cleanup);

  it("has screens on both sides, so neither expectation below is vacuous", () => {
    expect(SCREENS.filter((s) => s.offersPaste)).toHaveLength(3);
    expect(SCREENS.filter((s) => !s.offersPaste)).toHaveLength(8);
  });

  it.each(SCREENS)("$name", ({ props, offersPaste, pastesInto, pastesIntoDrive }) => {
    render(<FolderBrowser {...props} />);

    expect(pasteButtons().length > 0).toBe(offersPaste);

    pressPaste();
    expect(mockPaste).toHaveBeenCalledTimes(offersPaste ? 1 : 0);
    // Where, as well as whether. A paste that lands in the drive root
    // from inside a folder, or in the drive the files came from rather
    // than the one on screen, satisfies the count above.
    if (offersPaste) {
      // The drive on screen, which the clipboard deliberately does not
      // name: with both sides reading "main" no row could tell the two
      // apart, and routing a paste through the clipboard's own drive
      // moves files into a drive nobody is looking at.
      expect(mockPaste).toHaveBeenCalledWith(pastesIntoDrive ?? "main", pastesInto);
    }
  });

  it("declares a destination for every screen that offers to paste", () => {
    // Without this, dropping `pastesInto` from a row turns its assertion
    // above into `toHaveBeenCalledWith("main", undefined)`.
    expect(
      SCREENS.filter((s) => s.offersPaste && typeof s.pastesInto === "string"),
    ).toHaveLength(3);
    // And one of them is not on the drive the others are, or the drive half
    // of the assertion agrees with a constant.
    expect(
      SCREENS.filter((s) => s.offersPaste && s.props.driveName !== "main"),
    ).toHaveLength(1);
  });

  it("draws nothing to paste into when the clipboard is empty", () => {
    // The population for the banner half: without this, a screen that never
    // draws the banner satisfies every "false" row above.
    held.clipboard = null;
    render(<FolderBrowser driveName="main" folderPath="recipes" />);
    expect(pasteButtons()).toHaveLength(0);
  });
});
