import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/**
 * The real component is exercised in its own file. This stub keeps the
 * variant visible as a testid — and now draws the actions too, because
 * the calls to action moved *inside* it: a stub that swallowed them would
 * make every assertion about them pass whether or not this file passes any.
 */
vi.mock("@/components/EmptyState", () => ({
  EmptyState: ({
    variant,
    title,
    primaryAction,
    secondaryActions,
  }: {
    variant?: string;
    title?: React.ReactNode;
    primaryAction?: { label: string; onClick?: () => void; href?: string };
    secondaryActions?: readonly { label: string; onClick?: () => void; href?: string }[];
  }) => (
    <div data-testid={`empty-${variant ?? "custom"}`}>
      {title}
      {[primaryAction, ...(secondaryActions ?? [])].map((action) =>
        !action ? null : action.href !== undefined ? (
          <a key={action.label} href={action.href}>
            {action.label}
          </a>
        ) : (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ),
      )}
    </div>
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

const mockFolder = (name: string): Folder => ({
  name,
  path: name,
  file_count: 5,
  thumbnail_file_id: null,
  dominant_kind: null,
});

const defaultProps = {
  files: [mockFile("f1"), mockFile("f2")],
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

  it("shows no-profile empty state when isRecent and hasProfile is false", () => {
    render(<FolderContent {...defaultProps} files={[]} folders={[]} isRecent={true} hasProfile={false} />);
    expect(screen.getByTestId("empty-no-recent-profile")).toBeInTheDocument();
  });

  it("shows recent-added empty state", () => {
    render(<FolderContent {...defaultProps} files={[]} folders={[]} isRecentAdded={true} />);
    expect(screen.getByTestId("empty-no-recent-added")).toBeInTheDocument();
  });

  // spec 2026-08-21-folder-scoped-tag-filter §8 / §8.1
  it("shows a tag-specific empty state with a way to widen to the drive", () => {
    render(
      <FolderContent
        {...defaultProps}
        files={[]}
        folders={[]}
        widenTagScope={{ tagName: "soup", href: "/drive/main?tag=soup" }}
      />,
    );
    expect(screen.getByTestId("empty-no-tag-matches")).toBeInTheDocument();
    // "No matches in this folder" with no way out is a dead end — this is
    // the case the affordance matters most for.
    expect(
      screen.getByRole("link", { name: "Search the whole drive" }),
    ).toHaveAttribute("href", "/drive/main?tag=soup");
  });

  it("keeps the generic empty state when there is no tag scope to widen", () => {
    render(<FolderContent {...defaultProps} files={[]} folders={[]} widenTagScope={null} />);
    expect(screen.getByTestId("empty-no-files")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Search the whole drive" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing in search mode, even with a tag scope present", () => {
    // The semantic-search section above is a separate result axis; an
    // empty state here would contradict it. The two branches must not be
    // collapsed into one.
    const { container } = render(
      <FolderContent
        {...defaultProps}
        files={[]}
        folders={[]}
        isSearch={true}
        widenTagScope={{ tagName: "soup", href: "/drive/main?tag=soup" }}
      />,
    );
    expect(container.querySelector("[data-testid^='empty-']")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Search the whole drive" }),
    ).not.toBeInTheDocument();
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

/**
 * Phase 4 — right-pane filter tests.
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §2.
 *
 * RED phase — these assertions exercise the FilterField wiring that ships
 * with phase 4.4.
 */
describe("FolderContent right-pane filter (Phase 4)", () => {
  const mdFile: FileItem = {
    ...mockFile("doc"),
    filename: "spec.md",
    file_type: "document",
    mime_type: "text/markdown",
  };
  const videoFile: FileItem = {
    ...mockFile("vid"),
    filename: "intro.mp4",
    file_type: "video",
    mime_type: "video/mp4",
  };
  const imgFile: FileItem = {
    ...mockFile("img"),
    filename: "photo.jpg",
    file_type: "image",
    mime_type: "image/jpeg",
  };

  it("renders the FilterField input above the listing", () => {
    render(
      <FolderContent
        {...defaultProps}
        files={[mdFile, videoFile, imgFile]}
      />,
    );
    expect(
      screen.getByPlaceholderText(
        /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
      ),
    ).toBeInTheDocument();
  });

  it("with empty filter, all files pass through (regression)", () => {
    render(
      <FolderContent
        {...defaultProps}
        files={[mdFile, videoFile, imgFile]}
      />,
    );
    expect(screen.getByTestId("file-grid")).toHaveTextContent("3 files");
  });

  it("text filter narrows the file list (case-insensitive substring)", async () => {
    render(
      <FolderContent
        {...defaultProps}
        files={[mdFile, videoFile, imgFile]}
      />,
    );
    const input = screen.getByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "INTRO" } });

    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("1 files");
    });
  });

  it("offers no kind filter of its own — the toolbar's is the one that is right", async () => {
    // This pane used to carry a second kind filter forty pixels below
    // the toolbar's. The toolbar asks the server; this one sifted the
    // rows already loaded, so on a folder past its first page of thirty
    // the same choice gave two different answers.
    render(
      <FolderContent
        {...defaultProps}
        files={[mdFile, videoFile, imgFile]}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: /filter by type|filter\.openTypeFilter|型でフィルタ/i,
      }),
    ).toBeNull();
    // The text filter stays.
    expect(
      screen.getByPlaceholderText(
        /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
      ),
    ).toBeInTheDocument();
  });

  it("narrows on text alone", async () => {
    render(
      <FolderContent
        {...defaultProps}
        files={[
          { ...mdFile, filename: "spec-alpha.md" },
          { ...mdFile, id: "doc2", filename: "notes.md" },
          { ...videoFile, filename: "spec-vid.mp4" },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "spec" } });

    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("2 files");
    });
  });

  it("shows empty-filter message and a clear button when no files match", async () => {
    render(
      <FolderContent
        {...defaultProps}
        files={[mdFile, videoFile]}
      />,
    );
    const input = screen.getByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "zzz-no-match" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /no matching files in this folder|filter\.empty\.folder|このフォルダに該当するファイルはありません/i,
        ),
      ).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole("button", {
      name: /clear filters|filter\.clear|解除/i,
    });
    expect(clearBtn).toBeInTheDocument();
  });

  it("clicking the empty-state clear button restores all files", async () => {
    render(
      <FolderContent
        {...defaultProps}
        files={[mdFile, videoFile]}
      />,
    );
    const input = screen.getByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "zzz-no-match" } });

    const clearBtn = await screen.findByRole("button", {
      name: /clear filters|filter\.clear|解除/i,
    });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByTestId("file-grid")).toHaveTextContent("2 files");
    });
  });

  it("folder cards stay visible regardless of file filter", async () => {
    const folder: Folder = mockFolder("photos");
    render(
      <FolderContent
        {...defaultProps}
        files={[mdFile]}
        folders={[folder]}
      />,
    );
    const input = screen.getByPlaceholderText(
      /filter in this folder|filter\.placeholder\.folder|このフォルダで絞り込み/i,
    );
    fireEvent.change(input, { target: { value: "zzz" } });

    await waitFor(() => {
      // Folder card still renders even when file list is empty.
      expect(screen.getByTestId("folder-card")).toBeInTheDocument();
    });
  });
});
