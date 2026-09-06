import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dirtyRegistry } from "@/lib/dirtyRegistry";
import { navigationGuard } from "@/lib/navigationGuard";
import { treeEnabledStore } from "@/lib/treeEnabledStore";

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/drive/work";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

const mockGetFolderTree = vi.fn();
const mockGetFolders = vi.fn();
const mockGetDriveFiles = vi.fn();
const mockGetFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFolderTree: (...args: unknown[]) => mockGetFolderTree(...args),
  getFolders: (...args: unknown[]) => mockGetFolders(...args),
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getFile: (...args: unknown[]) => mockGetFile(...args),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  // Tree pane now mounts FolderContextMenu / FileContextMenu and reads
  // pinned folders. The TwoPaneLayout tests don't exercise the menus.
  // Use plain functions so afterEach's vi.restoreAllMocks() can't strip
  // their resolved values mid-suite.
  getPins: () => Promise.resolve([]),
  addPin: () => Promise.resolve(undefined),
  removePin: () => Promise.resolve(undefined),
  createTextFile: () => Promise.resolve({}),
  createFolder: () => Promise.resolve({}),
  renameFolder: () => Promise.resolve({}),
  moveFolder: () => Promise.resolve({}),
  deleteFolder: () => Promise.resolve(undefined),
  renameFile: () => Promise.resolve({}),
  moveFile: () => Promise.resolve({}),
  deleteFile: () => Promise.resolve(undefined),
  getDownloadUrl: (id: string) => `/api/files/${id}/download`,
}));

// SidebarProvider is consumed by usePinnedFolders.
// `overlayRequests` records what the tree asked the sidebar for, which is
// how the exclusivity rule is observed without mounting a real sidebar.
const overlayRequests = vi.hoisted(() => [] as boolean[]);
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
  useOverlaySidebarWhen: (active: boolean) => {
    overlayRequests.push(active);
  },
}));

// Clipboard provider is consumed by FileContextMenu.
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("@/components/FilePreview", () => ({
  FilePreview: ({ file }: { file: { id: string } }) => (
    <div data-testid="file-preview">preview:{file.id}</div>
  ),
}));

// PR-4: RightPaneFile now renders FileDetailContent (not FilePreview
// directly). Stub FileDetailContent + ImageGallery + useFileNav + TreeToggle
// so the TwoPaneLayout tests focus on host-level wiring (folder click
// pushes / file click replaces / chrome composition) rather than the
// per-file detail body, which has its own tests in PR-3.
vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: ({ fileId }: { fileId: string }) => (
    <div data-testid="file-detail-content">detail:{fileId}</div>
  ),
}));
vi.mock("@/components/ImageGallery", () => ({
  ImageGallery: () => <div data-testid="image-gallery" />,
}));
vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => ({ prevId: null, nextId: null })),
}));

// Stub virtualizer (jsdom layout) — keep parity with FolderTreePane test.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (i: number) => number }) => {
    const rows = Array.from({ length: count }, (_, i) => ({
      index: i,
      key: i,
      start: i * estimateSize(i),
      size: estimateSize(i),
      lane: 0,
    }));
    return {
      getTotalSize: () => count * estimateSize(0),
      getVirtualItems: () => rows,
      measureElement: () => undefined,
    };
  },
}));

import { TwoPaneLayout } from "../TwoPaneLayout";

const baseFile = (id: string) => ({
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: "work",
  folder_path: "Q1",
  file_type: "video" as const,
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 100,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
});

// jsdom has no `matchMedia`. The tree asks it one question — are the tree
// and the content wide enough to sit side by side — so the stub answers
// that, and `setViewportBeside` is how a test moves the window.
let besideMatches = true;
const mediaListeners = new Set<() => void>();
function setViewportBeside(next: boolean) {
  besideMatches = next;
  for (const l of mediaListeners) l();
}
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    get matches() {
      return besideMatches;
    },
    media: query,
    onchange: null,
    addListener: (l: () => void) => mediaListeners.add(l),
    removeListener: (l: () => void) => mediaListeners.delete(l),
    addEventListener: (_: string, l: () => void) => mediaListeners.add(l),
    removeEventListener: (_: string, l: () => void) => mediaListeners.delete(l),
    dispatchEvent: () => true,
  }),
});

beforeEach(() => {
  besideMatches = true;
  mediaListeners.clear();
  overlayRequests.length = 0;
  mockReplace.mockReset();
  mockPush.mockReset();
  mockGetFolderTree.mockReset();
  mockGetFolders.mockReset();
  mockGetDriveFiles.mockReset();
  mockGetFile.mockReset();
  mockPathname = "/drive/work";
  mockSearchParams = new URLSearchParams();
  localStorage.removeItem("tree:expanded:work");
  localStorage.removeItem("tree:typeFilter:work");
  localStorage.removeItem("rightPaneFolder:viewMode");
  navigationGuard.reset();
  dirtyRegistry.reset();
  // TwoPaneLayout now lazy-mounts FolderTreePane (DriveLayout keeps the
  // wrapper mounted regardless of tree state). Enable the tree by default
  // so existing host-level wiring tests still get a rendered tree pane.
  treeEnabledStore.reset();
  treeEnabledStore.set("work", true);
  treeEnabledStore.set("my drive", true);
});

afterEach(() => {
  vi.restoreAllMocks();
  navigationGuard.reset();
  dirtyRegistry.reset();
  treeEnabledStore.reset();
});

describe("TwoPaneLayout", () => {
  it("renders children on the right when no ?file param", async () => {
    mockGetFolderTree.mockResolvedValue([]);

    render(
      <TwoPaneLayout drive="work" folderPath="">
        <div data-testid="host-content">drive home content</div>
      </TwoPaneLayout>,
    );

    expect(screen.getByTestId("host-content")).toHaveTextContent("drive home content");
  });

  it("renders file right pane when ?file is present (overrides children)", async () => {
    mockSearchParams = new URLSearchParams("file=abc");
    mockGetFolderTree.mockResolvedValue([]);
    mockGetFile.mockResolvedValue(baseFile("abc"));

    render(
      <TwoPaneLayout drive="work" folderPath="">
        <div data-testid="host-content">should be hidden</div>
      </TwoPaneLayout>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toHaveTextContent(
        "detail:abc",
      ),
    );
    expect(screen.queryByTestId("host-content")).not.toBeInTheDocument();
  });

  it("folder click in tree pushes to drive path (not replace)", async () => {
    mockGetFolderTree.mockImplementation((_drive: string, params: { root?: string }) => {
      if (params.root === "" || params.root === undefined) {
        return Promise.resolve([
          { kind: "folder", name: "Q1", path: "Q1", file_count: 1, has_children: false },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <TwoPaneLayout drive="work" folderPath="">
        <div />
      </TwoPaneLayout>,
    );

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Q1"));

    expect(mockPush).toHaveBeenCalledWith("/drive/work/Q1", { scroll: false });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("first file click in tree pushes ?file (history entry)", async () => {
    mockGetFolderTree.mockResolvedValue([
      { kind: "file", name: "doc.md", path: "doc.md", file_id: "fid42", file_type: "document", mime_type: "text/markdown" },
    ]);

    render(
      <TwoPaneLayout drive="work" folderPath="">
        <div />
      </TwoPaneLayout>,
    );

    await waitFor(() => expect(screen.getByText("doc.md")).toBeInTheDocument());
    fireEvent.click(screen.getByText("doc.md"));

    expect(mockPush).toHaveBeenCalledWith("/drive/work?file=fid42", { scroll: false });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("switching to another file in tree replaces ?file (no extra history)", async () => {
    mockSearchParams = new URLSearchParams("file=fid01");
    mockGetFolderTree.mockResolvedValue([
      { kind: "file", name: "doc.md", path: "doc.md", file_id: "fid42", file_type: "document", mime_type: "text/markdown" },
    ]);
    mockGetFile.mockResolvedValue(baseFile("fid01"));

    render(
      <TwoPaneLayout drive="work" folderPath="">
        <div />
      </TwoPaneLayout>,
    );

    await waitFor(() => expect(screen.getByText("doc.md")).toBeInTheDocument());
    fireEvent.click(screen.getByText("doc.md"));

    expect(mockReplace).toHaveBeenCalledWith("/drive/work?file=fid42", { scroll: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("dirty editor defers folder click via navigationGuard (PR-5)", async () => {
    mockGetFolderTree.mockImplementation(
      (_drive: string, params: { root?: string }) => {
        if (params.root === "" || params.root === undefined) {
          return Promise.resolve([
            { kind: "folder", name: "Q1", path: "Q1", file_count: 1, has_children: false },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    dirtyRegistry.set("any-file", "knowledge-editor", true);

    render(
      <TwoPaneLayout drive="work" folderPath="">
        <div />
      </TwoPaneLayout>,
    );

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Q1"));

    // router.push held back until confirm fires
    expect(mockPush).not.toHaveBeenCalled();
    expect(navigationGuard.getPending()).not.toBeNull();
    act(() => {
      navigationGuard.confirm();
    });
    expect(mockPush).toHaveBeenCalledWith("/drive/work/Q1", { scroll: false });
  });

  it("encodes drive name with spaces in folder navigation", async () => {
    mockGetFolderTree.mockImplementation((_drive: string, params: { root?: string }) => {
      if (params.root === "" || params.root === undefined) {
        return Promise.resolve([
          { kind: "folder", name: "Q1", path: "Q1", file_count: 0, has_children: false },
        ]);
      }
      return Promise.resolve([]);
    });

    render(
      <TwoPaneLayout drive="my drive" folderPath="">
        <div />
      </TwoPaneLayout>,
    );

    await waitFor(() => expect(screen.getByText("Q1")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Q1"));

    expect(mockPush).toHaveBeenCalledWith("/drive/my%20drive/Q1", { scroll: false });
  });

  it("renders the leftPane prop instead of FolderTreePane when provided", async () => {
    // Spec ``2026-05-12-playlist-to-collection.md`` PR-B redo: the
    // optional ``leftPane`` prop lets the collection detail page swap
    // the left aside content without forking the layout shell.
    render(
      <TwoPaneLayout
        drive="work"
        folderPath=""
        leftPane={<div data-testid="custom-left">custom left content</div>}
        leftPaneAriaLabel="Custom items"
      >
        <div data-testid="host-content">main</div>
      </TwoPaneLayout>,
    );

    expect(screen.getByTestId("custom-left")).toHaveTextContent(
      "custom left content",
    );
    // FolderTreePane fetch must not happen because the default left
    // pane was overridden.
    expect(mockGetFolderTree).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Custom items")).toBeInTheDocument();
  });
});

/**
 * NAV-2. The sidebar and the tree both name where you are, and one such
 * surface at a time is design principle 3.
 */
describe("TwoPaneLayout — the tree borrows the sidebar's place", () => {
  const renderPane = () => {
    mockGetFolderTree.mockResolvedValue([]);
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 30 },
    });
    return render(
      <TwoPaneLayout drive="work" folderPath="">
        <div>right</div>
      </TwoPaneLayout>,
    );
  };

  it("asks for the place while the tree is open beside the content", async () => {
    renderPane();
    await waitFor(() => expect(overlayRequests.length).toBeGreaterThan(0));
    expect(overlayRequests.at(-1)).toBe(true);
  });

  it("gives it back when the tree closes", async () => {
    treeEnabledStore.set("work", false);
    renderPane();
    await waitFor(() => expect(overlayRequests.length).toBeGreaterThan(0));
    expect(overlayRequests.at(-1)).toBe(false);
  });

  it("does not ask while the tree is not beside the content", async () => {
    // Below `md` the sidebar is already an overlay, so there is nothing to
    // borrow, and the request must not be made on the strength of a stored
    // preference alone.
    besideMatches = false;
    renderPane();
    await waitFor(() => expect(overlayRequests.length).toBeGreaterThan(0));
    expect(overlayRequests.at(-1)).toBe(false);
  });

  /**
   * MB-5. Below `md` the tree takes the whole viewport and the content
   * `<section>` is `hidden`, so a stored "tree open" carried onto a phone
   * lands the reader on a screen with nothing on it.
   */
  describe("a narrow window", () => {
    it("shows the content, not a full-viewport tree", async () => {
      besideMatches = false;
      renderPane();
      await waitFor(() => expect(screen.getByText("right")).toBeInTheDocument());
      const aside = document.querySelector("aside")!;
      expect(aside.className).toContain("w-0");
      expect(aside.className).not.toContain("w-[100vw]");
      expect(aside).toHaveAttribute("aria-hidden", "true");
      expect(aside).toHaveAttribute("inert");
    });

    it("leaves the stored preference alone", async () => {
      besideMatches = false;
      renderPane();
      await waitFor(() => expect(screen.getByText("right")).toBeInTheDocument());
      // The setting is the reader's; the window is not an instruction to
      // change it. Widening has to bring the tree back.
      expect(localStorage.getItem("tree:enabled:work")).toBe("true");
      expect(treeEnabledStore.get("work")).toBe(true);
    });

    it("brings the tree back when the window widens again", async () => {
      besideMatches = false;
      renderPane();
      await waitFor(() => expect(screen.getByText("right")).toBeInTheDocument());
      expect(document.querySelector("aside")!.className).toContain("w-0");

      await act(async () => {
        setViewportBeside(true);
      });

      await waitFor(() =>
        expect(document.querySelector("aside")!.className).toContain(
          "md:w-[280px]",
        ),
      );
      expect(document.querySelector("aside")).not.toHaveAttribute("aria-hidden", "true");
    });

    it("still opens full-viewport when the reader asks for it there", async () => {
      // Turning it on while narrow is an explicit "show me this now",
      // which is a different thing from a setting carried over.
      besideMatches = false;
      treeEnabledStore.set("work", false);
      renderPane();
      await waitFor(() => expect(screen.getByText("right")).toBeInTheDocument());

      await act(async () => {
        treeEnabledStore.set("work", true);
      });

      await waitFor(() =>
        expect(document.querySelector("aside")!.className).toContain("w-[100vw]"),
      );
    });
  });
});

/**
 * NAV-2 rule 2. Making the two surfaces exclusive is only safe because a
 * third thing names your location in every combination of them — the
 * breadcrumb in `PageHeader`, which the right pane draws. The rule is
 * "do not break this", so it needs something that notices if it breaks.
 */
describe("TwoPaneLayout — the breadcrumb survives every combination", () => {
  const combinations: Array<[string, { tree: boolean; beside: boolean }]> = [
    ["tree on, sidebar has its place", { tree: true, beside: false }],
    ["tree on, sidebar lending", { tree: true, beside: true }],
    ["tree off, wide", { tree: false, beside: true }],
    ["tree off, narrow", { tree: false, beside: false }],
  ];

  it.each(combinations)("keeps it with the %s", async (_label, state) => {
    besideMatches = state.beside;
    treeEnabledStore.set("work", state.tree);
    mockGetFolderTree.mockResolvedValue([]);
    mockGetFolders.mockResolvedValue([]);
    mockGetDriveFiles.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 30 },
    });

    render(
      <TwoPaneLayout drive="work" folderPath="travel">
        <nav aria-label="Breadcrumb">
          <span>travel</span>
        </nav>
      </TwoPaneLayout>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Breadcrumb")).toBeInTheDocument(),
    );
    expect(screen.getByText("travel")).toBeInTheDocument();
  });

  it("covers all four combinations", () => {
    // "They all keep it" is also true of an empty table.
    expect(combinations).toHaveLength(4);
    expect(
      new Set(combinations.map(([, s]) => `${s.tree}:${s.beside}`)).size,
    ).toBe(4);
  });
});
