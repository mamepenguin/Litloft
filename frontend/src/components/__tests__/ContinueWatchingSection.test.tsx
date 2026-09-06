import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { WatchHistoryItem } from "@/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api", () => ({
  deleteWatchProgress: vi.fn(() => Promise.resolve()),
  renameFile: vi.fn(() => Promise.resolve({})),
  moveFile: vi.fn(() => Promise.resolve({})),
  deleteFile: vi.fn(() => Promise.resolve()),
  getDownloadUrl: vi.fn((id: string) => `/api/files/${id}/download`),
  getThumbnailUrl: vi.fn((id: string) => `/api/files/${id}/thumbnail`),
}));

vi.mock("../ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));

vi.mock("../RenameDialog", () => ({
  RenameDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="rename-dialog" /> : null,
}));

vi.mock("../MoveDialog", () => ({
  MoveDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="move-dialog" /> : null,
}));

vi.mock("../ConfirmDialog", () => ({
  ConfirmDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="confirm-dialog" /> : null,
}));

vi.mock("../CollectionPicker", () => ({
  CollectionPicker: ({ open }: { open: boolean }) =>
    open ? <div data-testid="collection-picker" /> : null,
}));

import { ContinueWatchingSection } from "../ContinueWatchingSection";
import { deleteWatchProgress } from "@/lib/api";

const item1: WatchHistoryItem = {
  image_width: null,
  image_height: null,
  id: "file-1",
  filename: "video1.mp4",
  title: "Video One",
  description: "",
  drive: "main",
  folder_path: "videos",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "/api/files/file-1/thumbnail",
  has_thumbnail: true,
  file_size: 1024,
  duration: 120,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-03-20T10:00:00",
  updated_at: "2026-03-20T10:00:00",
  watch_progress: { position: 30, duration: 120 },
};

const item2: WatchHistoryItem = {
  ...item1,
  id: "file-2",
  filename: "video2.mp4",
  title: "Video Two",
  watch_progress: { position: 60, duration: 200 },
};

describe("ContinueWatchingSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when not loading and items empty", () => {
    const { container } = render(
      <ContinueWatchingSection items={[]} loading={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders skeleton cards when loading", () => {
    const { container } = render(
      <ContinueWatchingSection items={[]} loading={true} />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders FileCards for each item", () => {
    render(
      <ContinueWatchingSection items={[item1, item2]} loading={false} />,
    );
    expect(screen.getByText("Video One")).toBeInTheDocument();
    expect(screen.getByText("Video Two")).toBeInTheDocument();
  });

  it("renders watch progress bar based on watchProgress", () => {
    const { container } = render(
      <ContinueWatchingSection items={[item1]} loading={false} />,
    );
    // FileCard renders a progress bar div when watchProgress.duration > 0.
    // The fill bar uses inline style width — assert at least one element has width style.
    const progressFills = container.querySelectorAll('[style*="width"]');
    expect(progressFills.length).toBeGreaterThan(0);
  });

  it("opens context menu on right-click", async () => {
    render(
      <ContinueWatchingSection items={[item1]} loading={false} />,
    );
    const card = screen.getByText("Video One");
    fireEvent.contextMenu(card);
    await waitFor(() => {
      expect(screen.getByText("Remove from history")).toBeInTheDocument();
    });
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Move to Trash")).toBeInTheDocument();
  });

  it("opens context menu after 500ms long-press", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ContinueWatchingSection items={[item1]} loading={false} />,
      );
      const card = screen.getByText("Video One");
      // Find the closest element that holds touch handlers (the wrapper).
      // Fire at the visible text — bubbling reaches handlers.
      fireEvent.touchStart(card, {
        touches: [{ clientX: 50, clientY: 50 }],
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.getByText("Remove from history")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls deleteWatchProgress and onRemoveItem when Remove from history clicked", async () => {
    const onRemoveItem = vi.fn();
    render(
      <ContinueWatchingSection
        items={[item1]}
        loading={false}
        onRemoveItem={onRemoveItem}
      />,
    );
    const card = screen.getByText("Video One");
    fireEvent.contextMenu(card);
    const removeBtn = await screen.findByText("Remove from history");
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(deleteWatchProgress).toHaveBeenCalledWith("file-1");
    });
    await waitFor(() => {
      expect(onRemoveItem).toHaveBeenCalledWith("file-1");
    });
  });

  it("does not call onRemoveItem when API rejects", async () => {
    (deleteWatchProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network"),
    );
    const onRemoveItem = vi.fn();
    render(
      <ContinueWatchingSection
        items={[item1]}
        loading={false}
        onRemoveItem={onRemoveItem}
      />,
    );
    const card = screen.getByText("Video One");
    fireEvent.contextMenu(card);
    const removeBtn = await screen.findByText("Remove from history");
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(deleteWatchProgress).toHaveBeenCalled();
    });
    // onRemoveItem should not be invoked on failure
    expect(onRemoveItem).not.toHaveBeenCalled();
  });
});
