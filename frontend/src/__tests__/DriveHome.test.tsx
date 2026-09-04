import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/lib/api", () => ({
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
