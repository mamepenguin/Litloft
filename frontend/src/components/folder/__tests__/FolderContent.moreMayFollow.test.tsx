import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";

import { FolderContent } from "../FolderContent";
import type { FileItem, Folder } from "@/types";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files, moreMayFollow }: { files: FileItem[]; moreMayFollow?: unknown }) => (
    <div data-testid="file-grid" data-more={String(moreMayFollow)}>
      {files.length} files
    </div>
  ),
}));

const photo = (id: string): FileItem => ({
  image_width: 4000,
  image_height: 3000,
  id,
  filename: `${id}.jpg`,
  title: id,
  description: "",
  drive: "main",
  folder_path: "",
  file_type: "image",
  mime_type: "image/jpeg",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1000,
  duration: null,
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
  files: [photo("beach"), photo("forest"), photo("harbour")],
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
  dragState: { isDragging: false, dragType: null, draggedFileIds: [], draggedFileIdSet: new Set<string>(), draggedFolderPath: null, dropTargetPath: null },
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

const more = () => screen.getByTestId("file-grid").getAttribute("data-more");
const filterInput = () =>
  screen.getByPlaceholderText(
    /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
  );

describe("SPEC-CORE-002 FolderContent tells FileGrid whether more may follow", () => {
  it("more may follow while the listing has more pages and no filter is active", () => {
    render(<FolderContent {...props} hasMore />);
    expect(more()).toBe("true");
  });

  it("nothing more follows once the listing has no more pages", () => {
    render(<FolderContent {...props} hasMore={false} />);
    expect(more()).toBe("false");
  });

  it("nothing more follows while a filter is typed, and more may follow again once it is cleared", async () => {
    render(<FolderContent {...props} hasMore />);
    expect(more()).toBe("true");

    fireEvent.change(filterInput(), { target: { value: "beach" } });
    await waitFor(() => expect(screen.getByTestId("file-grid")).toHaveTextContent("1 files"));
    expect(more()).toBe("false");

    fireEvent.change(filterInput(), { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId("file-grid")).toHaveTextContent("3 files"));
    expect(more()).toBe("true");
  });
});
