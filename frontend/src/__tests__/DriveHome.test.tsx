import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
  getPreviewUrl: (id: string) => `/api/files/${id}/preview`,
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
  file_size: 1024000,
  duration: 300,
  likes: 0,
  is_favorite: false,
  tags: [],
  subtitles: [],
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

  it("does not show Continue Watching when no profile", async () => {
    mockProfile.nickname = null;
    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(screen.queryByText("続きを見る")).toBeNull();
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
      expect(screen.getByText("続きを見る")).toBeInTheDocument();
    });
    expect(mockGetWatchHistory).toHaveBeenCalledWith("media", 12);
    expect(mockGetWatchHistory).toHaveBeenCalledWith("media", 12, "all");
  });

  it("does not show Continue Watching when profile is set but no items", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([]);

    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(screen.getByTestId("root-file-listing")).toBeInTheDocument();
    });
    expect(screen.queryByText("続きを見る")).toBeNull();
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
});
