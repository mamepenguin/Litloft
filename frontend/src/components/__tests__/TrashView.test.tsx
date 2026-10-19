import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  getTrash: vi.fn().mockResolvedValue({
    data: [
      {
        id: "f1",
        filename: "video1.mp4",
        title: "Video 1",
        description: "",
        drive: "main",
        folder_path: "",
        file_type: "video",
        mime_type: "video/mp4",
        thumbnail_url: "",
        has_thumbnail: false,
        file_size: 1024,
        duration: 120,
        liked_at: null,
        is_favorite: false,
        tags: [],
        subtitles: [],
        deleted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "f2",
        filename: "image1.jpg",
        title: "Image 1",
        description: "",
        drive: "main",
        folder_path: "",
        file_type: "image",
        mime_type: "image/jpeg",
        thumbnail_url: "",
        has_thumbnail: false,
        file_size: 2048,
        duration: null,
        liked_at: null,
        is_favorite: false,
        tags: [],
        subtitles: [],
        deleted_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    meta: { total: 2, page: 1, limit: 30 },
  }),
  restoreFile: vi.fn().mockResolvedValue({}),
  purgeFile: vi.fn().mockResolvedValue(undefined),
  emptyTrash: vi.fn().mockResolvedValue({ purged: 2 }),
  batchRestore: vi.fn().mockResolvedValue({ restored: 2, errors: [] }),
  batchPurge: vi.fn().mockResolvedValue({ purged: 2, errors: [] }),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, title, onConfirm, onCancel }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span data-testid="confirm-title">{title}</span>
        <button data-testid="confirm-btn" onClick={onConfirm}>Confirm</button>
        <button data-testid="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: ({ count, isTrashView }: any) =>
    count > 0 ? (
      <div data-testid="selection-bar">
        <span>{count} selected</span>
        {isTrashView && <span data-testid="trash-mode">trash mode</span>}
      </div>
    ) : null,
}));

vi.mock("@/components/trash/TrashToolbar", () => ({
  TrashToolbar: () => <div data-testid="trash-toolbar" />,
}));

vi.mock("@/components/trash/TrashFileGrid", () => ({
  TrashFileGrid: ({ files, onRestore, onPurge }: any) => (
    <div data-testid="trash-file-grid">
      {files.map((f: any) => (
        <div key={f.id} data-testid={`file-${f.id}`}>
          <span>{f.title}</span>
          <button data-testid={`restore-${f.id}`} onClick={() => onRestore(f.id)}>Restore</button>
          <button data-testid={`purge-${f.id}`} onClick={() => onPurge(f.id)}>Purge</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/components/trash/TrashFileList", () => ({
  TrashFileList: () => <div data-testid="trash-file-list" />,
}));

vi.mock("@/hooks/useInfiniteScroll", () => ({
  useInfiniteScroll: ({ fetchPage }: any) => {
    const { useState, useEffect, useRef, useCallback } = require("react");
    const [items, setItemsState] = useState([]);
    const [total, setTotal] = useState(0);
    const sentinelRef = useRef(null);
    const setItems = useCallback((fn: any) => {
      setItemsState((prev: any) => typeof fn === "function" ? fn(prev) : fn);
    }, []);

    useEffect(() => {
      fetchPage(1, 30).then((res: any) => {
        setItemsState(res.data);
        setTotal(res.total);
      });
    }, [fetchPage]);

    return {
      items,
      total,
      loading: false,
      loadingMore: false,
      hasMore: false,
      sentinelRef,
      reset: vi.fn(),
      setItems,
      setTotal,
    };
  },
}));

vi.mock("@/hooks/useSelection", () => ({
  useSelection: () => ({
    selectedIds: new Set(),
    count: 0,
    isSelected: () => false,
    toggle: vi.fn(),
    selectAll: vi.fn(),
    selectRange: vi.fn(),
    clear: vi.fn(),
  }),
}));

import { TrashView } from "../trash/TrashView";
import { restoreFile, purgeFile, emptyTrash } from "@/lib/api";

describe("TrashView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trash title", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByText("Trash")).toBeInTheDocument();
    });
  });

  it("renders trashed files", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByTestId("trash-file-grid")).toBeInTheDocument();
      expect(screen.getByText("Video 1")).toBeInTheDocument();
      expect(screen.getByText("Image 1")).toBeInTheDocument();
    });
  });

  it("shows empty trash button when files exist", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    });
  });

  it("restore button calls restoreFile", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByTestId("restore-f1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("restore-f1"));
    await waitFor(() => {
      expect(restoreFile).toHaveBeenCalledWith("f1");
    });
  });

  it("purge button shows confirmation dialog", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByTestId("purge-f1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("purge-f1"));
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
  });

  it("empty trash button shows confirmation dialog", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Empty Trash"));
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
  });

  it("confirms empty trash calls emptyTrash API", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Empty Trash"));
    await waitFor(() => {
      expect(screen.getByTestId("confirm-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("confirm-btn"));
    await waitFor(() => {
      expect(emptyTrash).toHaveBeenCalledWith("main");
    });
  });

  it("confirms purge calls purgeFile API", async () => {
    render(<TrashView driveName="main" />);
    await waitFor(() => {
      expect(screen.getByTestId("purge-f2")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("purge-f2"));
    await waitFor(() => {
      expect(screen.getByTestId("confirm-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("confirm-btn"));
    await waitFor(() => {
      expect(purgeFile).toHaveBeenCalledWith("f2");
    });
  });
});
