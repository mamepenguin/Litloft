import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WebSocketEvent } from "@/types";

// Mock profile
const mockProfile = { nickname: null as string | null, setNickname: vi.fn(), clearNickname: vi.fn() };
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => mockProfile,
  ProfileProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock sidebar
vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({
    isOpen: false,
    toggle: vi.fn(),
    close: vi.fn(),
    refreshKey: 0,
    requestRefresh: vi.fn(),
  }),
}));

// Mock clipboard
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

// Mock drag and drop
vi.mock("@/hooks/useDragAndDrop", () => ({
  useDragAndDrop: () => ({
    dragState: { isDragging: false, draggedFolderPath: null },
    handleFolderDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    getDropTargetProps: vi.fn(),
    isDropTarget: vi.fn(),
    isDropDisabled: vi.fn(),
  }),
}));

// Mock next/link
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock API
const mockGetDriveFiles = vi.fn();
const mockGetFolders = vi.fn();
const mockGetPins = vi.fn();
const mockGetWatchHistory = vi.fn();
const mockCreateFolder = vi.fn();
vi.mock("@/lib/api", () => ({
  createFolder: (...args: unknown[]) => mockCreateFolder(...args),
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getFolders: (...args: unknown[]) => mockGetFolders(...args),
  getPins: (...args: unknown[]) => mockGetPins(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  addPin: vi.fn(),
  removePin: vi.fn(),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
  moveFile: vi.fn(),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

// Mock child components that are complex
vi.mock("@/components/RootFileListing", () => ({
  RootFileListing: () => <div data-testid="root-file-listing" />,
}));

import { DriveHome } from "../components/DriveHome";
import type { WatchHistoryItem } from "@/types";

const makeWatchHistoryItem = (id: string): WatchHistoryItem => ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.mp4`,
  title: `Video ${id}`,
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024000,
  duration: 300,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  watch_progress: { position: 60, duration: 300 },
});

describe("DriveHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetFolders.mockResolvedValue([]);
    mockGetPins.mockResolvedValue([]);
    mockGetWatchHistory.mockResolvedValue([]);
    mockCreateFolder.mockResolvedValue(undefined);
  });

  it("asks the backend for liked files, ordered by when they were liked", async () => {
    // The counter this replaces was fetched with sort=likes and then
    // filtered client-side on `likes > 0`; the server filter replaces
    // both (spec 2026-09-01-favorite-like-separation).
    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(mockGetDriveFiles).toHaveBeenCalledWith(
        "media",
        expect.objectContaining({
          liked: true,
          sort: "liked_at",
          order: "desc",
        }),
      );
    });
  });

  it("does not show Continue Watching when no profile", async () => {
    mockProfile.nickname = null;
    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(screen.queryByText("Continue Watching")).toBeNull();
    });
    expect(mockGetWatchHistory).not.toHaveBeenCalled();
  });

  it("shows Continue Watching when profile is set and items exist", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([
      makeWatchHistoryItem("v1"),
      makeWatchHistoryItem("v2"),
    ]);

    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(screen.getByText("Continue Watching")).toBeInTheDocument();
    });
    expect(mockGetWatchHistory).toHaveBeenCalledWith("media", 12);
    expect(mockGetWatchHistory).toHaveBeenCalledWith("media", 12, "all");
  });

  it("does not show Continue Watching when profile is set but no items", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([]);

    render(<DriveHome driveName="media" />);

    // Waited on, not asserted once the file listing appears. Those are
    // two different fetches, and `ContinueWatchingSection` returns null
    // only when it is *done* loading with nothing — while the history
    // request is in flight it draws its heading. So the old form passed
    // whenever the listing happened to resolve second, and failed when
    // it resolved first, which under load it does.
    await waitFor(() => {
      expect(screen.getByTestId("root-file-listing")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("Continue Watching")).toBeNull();
    });
  });

  it("renders file titles from watch history", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([makeWatchHistoryItem("v1")]);

    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      const items = screen.getAllByText("Video v1");
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("live updates", () => {
    // A structural change refreshes the whole page, not just the folder
    // grid: the Recently added / Favourites / Popular rows are file
    // listings too, and were left showing files deleted elsewhere.
    function Live({ initial }: { initial: WebSocketEvent | null }) {
      const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(initial);
      (globalThis as Record<string, unknown>).__emit = setLastEvent;
      return (
        <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
          <DriveHome driveName="media" />
        </WebSocketContext.Provider>
      );
    }

    function emit(event: string, drive: string) {
      act(() => {
        (
          globalThis as unknown as {
            __emit: (e: WebSocketEvent) => void;
          }
        ).__emit({ event, data: { drive } });
      });
    }

    it("refetches the file sections on a structural change", async () => {
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      const before = mockGetDriveFiles.mock.calls.length;

      emit("drive.structure_changed", "media");

      await waitFor(() =>
        expect(mockGetDriveFiles.mock.calls.length).toBeGreaterThan(before),
      );
    });

    it("refetches on a content update, so favourites stay current", async () => {
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      const before = mockGetDriveFiles.mock.calls.length;

      // Favouriting is a content update, not a structural one.
      emit("drive.file_updated", "media");

      await waitFor(() =>
        expect(mockGetDriveFiles.mock.calls.length).toBeGreaterThan(before),
      );
    });

    it("ignores a change in another drive", async () => {
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      const before = mockGetDriveFiles.mock.calls.length;

      emit("drive.structure_changed", "other-drive");

      await new Promise((r) => setTimeout(r, 20));
      expect(mockGetDriveFiles.mock.calls.length).toBe(before);
    });
  });
});

describe("the drive home's content rows", () => {
  const oneFile = () => ({
    id: "f1",
    filename: "clip.mp4",
    title: "Clip",
    description: "",
    drive: "media",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 120,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified" as const,
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile.nickname = null;
    mockGetFolders.mockResolvedValue([]);
    mockGetPins.mockResolvedValue([]);
    mockGetWatchHistory.mockResolvedValue([]);
  });

  it("carries the server's total through to the See all link", async () => {
    // The whole point of the change, and the half of it that no
    // component test can see: `applyFileSections` reads `meta.total` off
    // a response the row never fetches itself. Delete that one line and
    // `CarouselSection`'s own tests stay green while the count silently
    // stops appearing.
    mockGetDriveFiles.mockResolvedValue({
      data: [oneFile()],
      meta: { total: 619, page: 1, limit: 12 },
    });
    render(<DriveHome driveName="media" />);
    // All three file rows read from the same mock, so all three carry it.
    const links = await screen.findAllByRole("link", { name: "See all (619)" });
    expect(links).toHaveLength(3);
  });

  it("gives each row its own total, and drops a row whose fetch failed", async () => {
    // The three rows are one `allSettled`, so a single shared total would
    // pass a test that resolves all three the same way. Recently added
    // resolves with 619; Favourites and Liked reject, and a row with
    // nothing in it does not render at all — which is also why "a failed
    // section shows no count" is not assertable here and is asserted
    // against `CarouselSection` directly in `section-rows.test.tsx`.
    mockGetDriveFiles
      .mockResolvedValueOnce({ data: [oneFile()], meta: { total: 619, page: 1, limit: 12 } })
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"));

    render(<DriveHome driveName="media" />);

    const links = await screen.findAllByRole("link", { name: "See all (619)" });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toContain("view=recent-added");
    expect(screen.queryByText("Favorites")).toBeNull();
  });

  it("gives both watch-history rows somewhere to send the reader", async () => {
    // The rows draw only what fits, so a row without a destination
    // discards the rest of the history with nothing saying so. Continue
    // watching has no view of its own; Recently played is the same
    // history without the 90% gate, so it is a superset and an honest
    // target for both.
    mockProfile.nickname = "Alice";
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetWatchHistory.mockResolvedValue([
      makeWatchHistoryItem("v1"),
      makeWatchHistoryItem("v2"),
    ]);
    render(<DriveHome driveName="media" />);

    await screen.findByText("Continue Watching");
    const rows = ["Continue Watching", "Recently Viewed"];
    for (const heading of rows) {
      const section = screen.getByText(heading).closest("section")!;
      const seeAll = section.querySelector("a[href*='view=recent']");
      expect(seeAll, `${heading} has no See all`).not.toBeNull();
    }
  });
});

describe("the drive root's header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetFolders.mockResolvedValue([]);
    mockGetPins.mockResolvedValue([]);
    mockGetWatchHistory.mockResolvedValue([]);
    mockCreateFolder.mockResolvedValue(undefined);
  });

  it("carries Add beside the breadcrumb", async () => {
    render(<DriveHome driveName="media" />);
    const add = await screen.findByRole("button", { name: "Add" });
    // In the header, not merely on the page: the whole point of D-2 is
    // that this control was a screenful of scrolling below the top.
    expect(add.closest("header")).not.toBeNull();
  });

  it("names no subject of its own", async () => {
    // The breadcrumb is the subject on this screen, so `PageHeader` emits
    // no `<h1>` (`page-headings.test.ts` holds the other side of this).
    // Moving the header into that component must not have introduced one.
    const { container } = render(<DriveHome driveName="media" />);
    await screen.findByRole("button", { name: "Add" });
    expect(container.querySelectorAll("h1")).toHaveLength(0);
  });

  it("opens its menu away from the edge it sits against", async () => {
    // Add is the rightmost control in the header, and the panel is wider
    // than the trigger. `AddButton.test.tsx` holds the two anchors; this
    // holds that this caller asked for the right one, which is the half
    // that a default would silently get wrong.
    render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const classes = screen.getByRole("menu").getAttribute("class")!.split(/\s+/);
    expect(classes).toContain("right-0");
    expect(classes).not.toContain("left-0");
  });

  it("opens the name field under the header, and creates from it", async () => {
    const { container } = render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByText("New Folder"));

    const field = screen.getByPlaceholderText("Folder name...");

    // Where it opens is the requirement, not merely that it left the
    // listing: a field at the bottom of the page splits one action across
    // the length of it, which is the defect this move is fixing. Moving
    // the JSX below `RootFileListing` breaks nothing without this.
    const header = container.querySelector("header")!;
    const listing = screen.getByTestId("root-file-listing");
    expect(
      header.compareDocumentPosition(field) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      field.compareDocumentPosition(listing) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.change(field, { target: { value: "Reading" } });

    const foldersBefore = mockGetFolders.mock.calls.length;
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(mockCreateFolder).toHaveBeenCalledWith("media", "", "Reading"),
    );
    // The folder row has to be refetched, or the folder the user just made
    // is not there. `refreshFolders` also refreshes the tree.
    // Exactly one refetch. `>=` would also pass a change that refetched
    // twice, which is the shape "refresh the folder row, leave the file
    // listing alone" exists to avoid.
    await waitFor(() =>
      expect(mockGetFolders.mock.calls.length).toBe(foldersBefore + 1),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Folder name...")).toBeNull(),
    );
  });

  it("rejects a name with a path separator without calling the API", async () => {
    render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByText("New Folder"));

    const field = screen.getByPlaceholderText("Folder name...");
    fireEvent.change(field, { target: { value: "a/b" } });
    fireEvent.keyDown(field, { key: "Enter" });

    // Announced, not just printed: a rejected name is the only feedback
    // there is, and a field that silently refuses is indistinguishable
    // from one that is still working.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid folder name",
    );
    expect(screen.getByPlaceholderText("Folder name...")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mockCreateFolder).not.toHaveBeenCalled();
    // The row stays open on a rejection — the name is still there to fix.
    expect(screen.getByPlaceholderText("Folder name...")).toBeInTheDocument();
  });

  it("closes the name field on Escape", async () => {
    render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByText("New Folder"));

    const field = screen.getByPlaceholderText("Folder name...");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Folder name...")).toBeNull();
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });
});
