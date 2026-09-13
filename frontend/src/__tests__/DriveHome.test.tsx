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

// Not the page's own: the content rows draw `FileCard`s, each of which
// renders a `FileContextMenu` whose `useFileMenuItems` reaches for the
// clipboard (`useFileMenuItems.ts:60`). Removing this stand-in throws
// on render.
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

const mockRefreshTree = vi.fn();
vi.mock("@/components/TreeRefreshContext", () => ({
  useTreeRefresh: () => mockRefreshTree,
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

// What this page and the real components under it reach for. A binding
// here that the tree never calls reads as "the page does this and we are
// suppressing it", which is how a folder grid stayed in this file's
// fixture after the page stopped drawing one.
const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
const mockInitUpload = vi.fn();
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  // The real `UploadZone` runs here, so an upload started on this page
  // goes all the way through `useUpload` and out the far side as
  // `onUploadComplete`.
  initUpload: (...args: unknown[]) => mockInitUpload(...args),
  uploadChunk: vi.fn().mockResolvedValue(undefined),
  completeUpload: vi.fn().mockResolvedValue(undefined),
  cancelUpload: vi.fn().mockResolvedValue(undefined),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
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
    mockRefreshTree.mockClear();
    vi.clearAllMocks();
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetWatchHistory.mockResolvedValue([]);
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

    // `ContinueWatchingSection` returns null only when it is *done*
    // loading with nothing — while the history request is in flight it
    // draws its heading. So waiting for the heading to go is waiting for
    // the fetch to settle. Asserted only after it has been seen once:
    // without that, a section that never mounted at all would satisfy
    // the wait on its first tick.
    expect(screen.getByText("Continue Watching")).toBeInTheDocument();
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

    it("tells the folder tree the drive changed shape", async () => {
      // The tree pane is on this page — the header draws its toggle — and
      // nothing else here tells it. The signal used to reach the tree
      // through the folder grid's own refresh, which is gone; both of
      // `refreshPage`'s entrances need it, and this is the one with an
      // emitter to press.
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      mockRefreshTree.mockClear();

      emit("drive.structure_changed", "media");

      await waitFor(() => expect(mockRefreshTree).toHaveBeenCalled());
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
    mockGetWatchHistory.mockResolvedValue([]);
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

  /**
   * Upload from this screen goes through a zone, not through a prop.
   *
   * `dispatchUploadEvent` resolves `document.querySelector(
   * "[data-upload-zone]")` at the moment the picker returns
   * (`useFilePicker.tsx:19`), and `UploadZone` is the only thing that
   * emits that attribute. A page with **Add** on it and no zone under it
   * opens the file chooser, takes the reader's files, and drops them
   * with no error — which is why this is asserted on the page rather
   * than on the button.
   */
  it("puts a zone under Add for the files it collects to land in", async () => {
    render(<DriveHome driveName="media" />);
    await screen.findByRole("button", { name: "Add" });
    expect(document.querySelectorAll("[data-upload-zone]")).toHaveLength(1);
  });

  it("tells the folder tree when an upload finishes here", async () => {
    // The second of the two entrances into `refreshPage`. The socket one
    // is held next door; this one has no emitter, so it is pressed by
    // handing the zone the same `upload-files` event `useFilePicker`
    // dispatches when the file chooser returns. An upload landing at the
    // drive root changes the drive's shape, and the tree pane on this
    // page is what would otherwise go on showing the old one.
    mockInitUpload.mockResolvedValue({ upload_id: "upload-1" });
    const { container } = render(<DriveHome driveName="media" />);
    await screen.findByRole("button", { name: "Add" });
    mockRefreshTree.mockClear();

    const zone = container.querySelector("[data-upload-zone]")!;
    await act(async () => {
      zone.dispatchEvent(
        new CustomEvent("upload-files", { detail: [new File(["x"], "note.txt")] }),
      );
    });

    await waitFor(() => expect(mockRefreshTree).toHaveBeenCalled());
  });

  it("offers uploading and nothing that acts on a folder", async () => {
    // This screen holds no folders, so its Add menu holds no folder
    // actions (spec 2026-09-12-purpose-oriented-navigation §6.1/§6.4).
    // `AddButton` grows **New Folder** and **New Note** each from a prop
    // the caller passes, so the rule lives in what this caller does not
    // pass, and nothing else can witness it. The rows it does draw are
    // declared rather than counted: one appearing moves this side of the
    // equality by itself.
    //
    // **What this does not reach.** `addonProps` is the third such prop,
    // and its rows are gated on `hasSlot(ADD_MENU_SLOT)` as well
    // (`AddButton.tsx:106`). No addon registers that slot here, so
    // passing `addonProps` from this page changes nothing a test can
    // see — measuring it means standing in for the slot registry, which
    // is `AddonSlot`'s subject and not this page's.
    render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const rows = screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());
    expect(rows).toEqual(["Files", "Folder"]);
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

});
