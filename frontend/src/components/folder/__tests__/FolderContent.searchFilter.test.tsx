import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FileItem, Folder } from "@/types";
import { FolderContent } from "../FolderContent";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode }) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => <div data-testid="file-grid">{files.length}</div>,
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => <div data-testid="file-list">{files.length}</div>,
}));

const file = (id: string): FileItem => ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const props = {
  files: [file("f1"), file("f2")],
  folders: [] as Folder[],
  driveName: "main",
  viewMode: "grid" as const,
  loading: false,
  loadingMore: false,
  isRecent: false,
  hasProfile: true,
  isFavorites: false,
  isLiked: false,
  isRecentAdded: false,
  selectable: false,
  sortQuery: "",
  pinnedPaths: new Set<string>(),
  sentinelRef: createRef<HTMLDivElement>(),
  dragState: {
    isDragging: false,
    dragType: null,
    draggedFileIds: [],
    draggedFileIdSet: new Set<string>(),
    draggedFolderPath: null,
    dropTargetPath: null,
  },
  isDropTarget: () => false,
  getDropTargetProps: () => ({}),
  selectedIds: new Set<string>(),
  onSelect: vi.fn(),
  onMetaSelect: vi.fn(),
  onShiftSelect: vi.fn(),
  onTogglePin: vi.fn(),
  onFavoriteToggle: vi.fn(),
  onRefresh: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  selectedCount: 0,
  isDropDisabled: () => false,
  onFolderDragStart: vi.fn(),
};

describe("SPEC-CORE-066 I2 the filter field is a folder's, not the search page's", () => {
  it("renders no text filter for search results and keeps it on a folder", () => {
    const search = render(<FolderContent {...props} isSearch />);
    expect(screen.getByTestId("file-grid")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    search.unmount();

    render(<FolderContent {...props} />);
    expect(screen.getByPlaceholderText(/filter in this folder/i)).toBeInTheDocument();
  });
});
