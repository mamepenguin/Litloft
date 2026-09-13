import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Only the data is mocked: the grid, list and selection state are real,
// because stubbing them is what hid a child that never called `onMetaSelect`.

const files = vi.hoisted(() => [
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
    duration: 0,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "f3",
    filename: "doc1.pdf",
    title: "Doc 1",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 4096,
    duration: 0,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
]);

vi.mock("@/lib/api", () => ({
  getTrash: vi.fn().mockResolvedValue({ data: files, meta: { total: files.length } }),
  restoreFile: vi.fn().mockResolvedValue({}),
  purgeFile: vi.fn().mockResolvedValue({}),
  emptyTrash: vi.fn().mockResolvedValue({}),
  getThumbnailUrl: (id: string) => `/thumb/${id}`,
}));

vi.mock("@/hooks/useInfiniteScroll", () => ({
  useInfiniteScroll: ({ fetchPage }: any) => {
    const { useState, useEffect, useRef, useCallback } = require("react");
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const sentinelRef = useRef(null);
    useEffect(() => {
      fetchPage(1, 30).then((res: any) => {
        setItems(res.data);
        setTotal(res.total);
      });
    }, [fetchPage]);
    return {
      items, total, loading: false, loadingMore: false, hasMore: false,
      sentinelRef, reset: vi.fn(),
      setItems: useCallback((fn: any) => setItems(fn), []),
      setTotal,
    };
  },
}));

vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: ({ count }: any) =>
    count > 0 ? <div data-testid="selection-bar">{count} selected</div> : null,
}));

vi.mock("@/components/trash/TrashToolbar", () => ({
  TrashToolbar: ({ onViewChange }: any) => (
    <button data-testid="show-list" onClick={() => onViewChange("list")}>
      list
    </button>
  ),
}));

import { TrashView } from "../TrashView";

const selectionCount = () =>
  screen.queryByTestId("selection-bar")?.textContent ?? "none";

beforeEach(() => {
  cleanup();
});

describe("Cmd/Ctrl-click in the trash", () => {
  it("starts a selection from the grid, without selection mode being on first", async () => {
    render(<TrashView driveName="main" />);
    const title = await screen.findByText("Video 1");

    expect(selectionCount()).toBe("none");

    fireEvent.click(title, { metaKey: true });

    await waitFor(() => expect(selectionCount()).toBe("1 selected"));
  });

  it("adds a second file to the selection with Ctrl", async () => {
    render(<TrashView driveName="main" />);
    fireEvent.click(await screen.findByText("Video 1"), { metaKey: true });
    await waitFor(() => expect(selectionCount()).toBe("1 selected"));

    fireEvent.click(screen.getByText("Image 1"), { ctrlKey: true });

    await waitFor(() => expect(selectionCount()).toBe("2 selected"));
  });

  it("takes a file back out of the selection", async () => {
    render(<TrashView driveName="main" />);
    const title = await screen.findByText("Video 1");
    fireEvent.click(title, { metaKey: true });
    await waitFor(() => expect(selectionCount()).toBe("1 selected"));

    fireEvent.click(title, { metaKey: true });

    await waitFor(() => expect(selectionCount()).toBe("none"));
  });

  it("starts a selection from the list as well as the grid", async () => {
    render(<TrashView driveName="main" />);
    await screen.findByText("Video 1");
    fireEvent.click(screen.getByTestId("show-list"));

    fireEvent.click(await screen.findByText("Video 1"), { metaKey: true });

    await waitFor(() => expect(selectionCount()).toBe("1 selected"));
  });

  it("lets Shift extend the range even with Cmd held, once a selection is running", async () => {
    render(<TrashView driveName="main" />);
    fireEvent.click(await screen.findByText("Video 1"), { metaKey: true });
    await waitFor(() => expect(selectionCount()).toBe("1 selected"));

    // Third file, so a range (three) and a toggle (two) give different counts.
    fireEvent.click(screen.getByText("Doc 1"), { metaKey: true, shiftKey: true });

    await waitFor(() => expect(selectionCount()).toBe("3 selected"));
  });

  it("lets Shift extend the range in the list too", async () => {
    render(<TrashView driveName="main" />);
    await screen.findByText("Video 1");
    fireEvent.click(screen.getByTestId("show-list"));

    fireEvent.click(await screen.findByText("Video 1"), { metaKey: true });
    await waitFor(() => expect(selectionCount()).toBe("1 selected"));

    fireEvent.click(screen.getByText("Doc 1"), { metaKey: true, shiftKey: true });

    await waitFor(() => expect(selectionCount()).toBe("3 selected"));
  });

  it("leaves a plain click in the list alone while selection mode is off", async () => {
    render(<TrashView driveName="main" />);
    await screen.findByText("Video 1");
    fireEvent.click(screen.getByTestId("show-list"));
    const title = await screen.findByText("Video 1");

    fireEvent.click(title);
    await act(async () => {});
    expect(selectionCount()).toBe("none");

    fireEvent.click(title, { metaKey: true });
    await waitFor(() => expect(selectionCount()).toBe("1 selected"));
  });

  it("leaves a plain click alone while selection mode is off", async () => {
    render(<TrashView driveName="main" />);
    const title = await screen.findByText("Video 1");

    fireEvent.click(title);
    // Flushed, then asserted: `waitFor` on "still nothing" passes on its first
    // check, before the click has rendered.
    await act(async () => {});
    expect(selectionCount()).toBe("none");

    fireEvent.click(title, { metaKey: true });
    await waitFor(() => expect(selectionCount()).toBe("1 selected"));
  });
});
