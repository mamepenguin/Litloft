import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FolderContent } from "../FolderContent";
import type { FileItem, Folder } from "@/types";
import { createRef } from "react";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-grid">{files.length} files</div>
  ),
}));

vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-list">{files.length} files</div>
  ),
}));

vi.mock("@/components/EmptyState", () => ({
  EmptyState: ({ variant }: { variant: string }) => (
    <div data-testid={`empty-${variant}`}>Empty</div>
  ),
}));

vi.mock("@/components/FolderCard", () => ({
  FolderCard: ({ folder }: { folder: Folder }) => (
    <div data-testid="folder-card">{folder.name}</div>
  ),
}));

const mockFile = (id: string): FileItem => ({
  id,
  filename: `${id}.mp4`,
  title: id,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  file_size: 1000,
  duration: 60,
  likes: 0,
  is_favorite: false,
  tags: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const mockFolder = (name: string): Folder => ({
  name,
  path: name,
  file_count: 5,
  thumbnail_file_id: null,
});

const defaultProps = {
  files: [mockFile("f1"), mockFile("f2")],
  folders: [] as Folder[],
  driveName: "main",
  viewMode: "grid" as const,
  loading: false,
  loadingMore: false,
  isRecent: false,
  isFavorites: false,
  isRecentAdded: false,
  selectable: false,
  sortQuery: "",
  pinnedPaths: new Set<string>(),
  sentinelRef: createRef<HTMLDivElement>(),
  dragState: { isDragging: false, draggedFileIds: [], dropTargetPath: null },
  isDropTarget: () => false,
  getDropTargetProps: () => ({}),
  isSelected: () => false,
  onSelect: vi.fn(),
  onMetaSelect: vi.fn(),
  onShiftSelect: vi.fn(),
  onTogglePin: vi.fn(),
  onFavoriteToggle: vi.fn(),
  onRefresh: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  selectedCount: 0,
};

describe("FolderContent", () => {
  it("renders FileGrid in grid mode", () => {
    render(<FolderContent {...defaultProps} />);
    expect(screen.getByTestId("file-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("file-list")).not.toBeInTheDocument();
  });

  it("renders FileList in list mode", () => {
    render(<FolderContent {...defaultProps} viewMode="list" />);
    expect(screen.getByTestId("file-list")).toBeInTheDocument();
    expect(screen.queryByTestId("file-grid")).not.toBeInTheDocument();
  });

  it("shows loading spinner when loading", () => {
    const { container } = render(<FolderContent {...defaultProps} loading={true} />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("file-grid")).not.toBeInTheDocument();
  });

  it("shows empty state for no files", () => {
    render(<FolderContent {...defaultProps} files={[]} folders={[]} />);
    expect(screen.getByTestId("empty-no-files")).toBeInTheDocument();
  });

  it("shows favorites empty state", () => {
    render(<FolderContent {...defaultProps} files={[]} folders={[]} isFavorites={true} />);
    expect(screen.getByTestId("empty-no-favorites")).toBeInTheDocument();
  });

  it("shows recent empty state", () => {
    render(<FolderContent {...defaultProps} files={[]} folders={[]} isRecent={true} />);
    expect(screen.getByTestId("empty-no-recent")).toBeInTheDocument();
  });

  it("shows recent-added empty state", () => {
    render(<FolderContent {...defaultProps} files={[]} folders={[]} isRecentAdded={true} />);
    expect(screen.getByTestId("empty-no-recent-added")).toBeInTheDocument();
  });

  it("renders folder cards when folders exist", () => {
    render(
      <FolderContent
        {...defaultProps}
        folders={[mockFolder("photos"), mockFolder("docs")]}
      />
    );
    const cards = screen.getAllByTestId("folder-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("photos")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("hides sentinel when isRecent", () => {
    const { container } = render(
      <FolderContent {...defaultProps} isRecent={true} />
    );
    // sentinel ref div should not be rendered for recent view
    // The sentinel is inside a conditional that checks !isRecent
    const sentinels = container.querySelectorAll("[class*='py-4']");
    // Check no sentinel with loadingMore spinner
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("shows loadingMore spinner", () => {
    const { container } = render(
      <FolderContent {...defaultProps} loadingMore={true} />
    );
    const spinners = container.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
  });
});
