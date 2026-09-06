import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Cmd/Ctrl-click multi-selection in the trash, through the components the
 * user actually clicks.
 *
 * `TrashView.test.tsx` replaces `TrashFileGrid` and `TrashFileList` with
 * stubs and `useSelection` with a set of `vi.fn()`s. That is what let the
 * defect live: `TrashView` passed `onMetaSelect` and both children took it
 * and never called it, and every layer the stubs stood in for was the layer
 * that was broken. So this file mocks only the data — the trash request and
 * the paging hook — and renders the real grid, the real list and the real
 * selection state.
 */

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

// The selection bar is the surface that says a selection exists at all.
vi.mock("@/components/SelectionBar", () => ({
  SelectionBar: ({ count }: any) =>
    count > 0 ? <div data-testid="selection-bar">{count} selected</div> : null,
}));

// Kept as a stub so the view can be switched without driving the real
// toolbar's menus — but it hands back the host's own callback.
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

    // Selection mode is off: this press is what turns it on, which is why
    // `handleMetaSelect` calls `setSelectable(true)` before toggling.
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
    // Flushed, then asserted. `waitFor` on "still nothing" passes on its
    // first check — before the click it is meant to rule out has rendered —
    // so it would report success no matter what the click did.
    await act(async () => {});
    expect(selectionCount()).toBe("none");

    // And the same press with the modifier does select, so the quiet above
    // is this click being ignored rather than the whole path being dead.
    fireEvent.click(title, { metaKey: true });
    await waitFor(() => expect(selectionCount()).toBe("1 selected"));
  });
});
