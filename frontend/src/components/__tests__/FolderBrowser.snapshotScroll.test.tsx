/**
 * spec 2026-08-21-file-list-deep-scroll-cost §6.1
 *
 * The snapshot write is debounced, so a pending write has to be flushed
 * when the component unmounts — an in-app navigation never fires
 * `pagehide`. The trap is *where the offset comes from*: the scroll
 * container belongs to TwoPaneLayout and outlives FolderBrowser, so by
 * the time the unmount flush runs React has already removed the rows,
 * the container has collapsed, and `scrollTop` reads 0. A flush that
 * re-reads the DOM therefore overwrites a good offset with zero on
 * every navigation into a file — which is exactly the regression these
 * tests pin down.
 *
 * The existing FolderBrowser tests cannot catch it: they mock
 * `useScrollContainer` to null and hand the browser an empty file list,
 * and `save` bails out on both.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { createRef } from "react";

import { FolderBrowser } from "../FolderBrowser";
import { saveListSnapshot } from "@/lib/listSnapshot";
import type { FileItem } from "@/types";

// ---- heavy children / infrastructure ----------------------------------------

vi.mock("@/components/folder/FolderContent", () => ({
  FolderContent: () => <div data-testid="folder-content" />,
}));
vi.mock("@/components/Breadcrumb", () => ({ Breadcrumb: () => <nav /> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/SmartFolderSaveButton", () => ({ SmartFolderSaveButton: () => null }));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SortButton", () => ({ SortButton: () => null }));
vi.mock("@/components/UploadButton", () => ({ UploadButton: () => null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn() }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useShortcuts", () => ({ useShortcuts: vi.fn() }));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => ({ fileId: null }) }));
vi.mock("@/hooks/useTreeEnabled", () => ({ useTreeEnabled: () => ({ enabled: false }) }));
vi.mock("@/components/folder/usePinnedFolders", () => ({
  usePinnedFolders: () => ({ pinnedPaths: new Set<string>(), togglePin: vi.fn() }),
}));
vi.mock("@/components/folder/useDriveScan", () => ({
  useDriveScan: () => ({ scanning: false, handleScan: vi.fn() }),
}));
vi.mock("@/components/folder/useCreateFolder", () => ({
  useCreateFolder: () => ({
    creatingFolder: false, newFolderName: "", folderError: null,
    setCreatingFolder: vi.fn(), setNewFolderName: vi.fn(),
    setFolderError: vi.fn(), handleCreateFolder: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCreateFile", () => ({
  useCreateFile: () => ({ createFile: vi.fn(), isCreating: false }),
}));

vi.mock("@/lib/listSnapshot", () => ({
  buildListSnapshotKey: () => "key",
  clearListSnapshot: vi.fn(),
  loadListSnapshot: () => null,
  saveListSnapshot: vi.fn(),
}));

const FILE: FileItem = {
  id: "f1", filename: "a.jpg", title: "a", description: "", drive: "main",
  folder_path: "photos", file_type: "image", mime_type: "image/jpeg",
  thumbnail_url: "", has_thumbnail: true, file_size: 1, duration: null,
  liked_at: null, is_favorite: false, tags: [], subtitles: [],
  deleted_at: null, missing_since: null,
  trust_tier: "verified", trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/components/folder/useFolderFiles", () => ({
  useFolderFiles: () => ({
    files: [FILE], folders: [], total: 1, loading: false, loadingMore: false,
    hasMore: false, pagesLoaded: 1, sentinelRef: { current: null },
    reset: vi.fn(), setFiles: vi.fn(), setPaginatedTotal: vi.fn(), setFolders: vi.fn(),
    isRecent: false, hasProfile: false, snapshotKey: "key", hydratedScrollY: null,
  }),
}));

// A real element standing in for TwoPaneLayout's <section>. It is
// deliberately created outside the render tree, because that is the
// point: it outlives FolderBrowser.
const scroller = document.createElement("div");
const scrollerRef = createRef<HTMLElement>() as { current: HTMLElement | null };
scrollerRef.current = scroller;
vi.mock("@/lib/scrollContainer", () => ({
  useScrollContainer: () => scrollerRef,
}));

const savedScrollYs = () =>
  vi.mocked(saveListSnapshot).mock.calls.map(([snap]) => snap.scrollY);

describe("FolderBrowser — snapshot scroll offset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(saveListSnapshot).mockClear();
    scroller.scrollTop = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists the offset the user scrolled to, once scrolling settles", () => {
    render(<FolderBrowser driveName="main" folderPath="photos" />);

    act(() => {
      scroller.scrollTop = 3000;
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(savedScrollYs()).not.toContain(3000); // still debounced

    act(() => { vi.advanceTimersByTime(200); });
    expect(savedScrollYs()).toContain(3000);
  });

  it("keeps the last live offset when the container has already collapsed at unmount", () => {
    const { unmount } = render(<FolderBrowser driveName="main" folderPath="photos" />);

    act(() => {
      scroller.scrollTop = 3000;
      scroller.dispatchEvent(new Event("scroll"));
    });

    // React removes our rows before the unmount flush runs, so the
    // shared container collapses back to the top. Re-reading it here is
    // what used to clobber the snapshot.
    scroller.scrollTop = 0;
    act(() => { unmount(); });

    const written = savedScrollYs();
    expect(written.length).toBeGreaterThan(0);
    expect(written.at(-1)).toBe(3000);
  });

  it("does not lose a pending write when unmount beats the debounce", () => {
    const { unmount } = render(<FolderBrowser driveName="main" folderPath="photos" />);

    act(() => {
      scroller.scrollTop = 1500;
      scroller.dispatchEvent(new Event("scroll"));
    });
    // Navigate away well inside the debounce window.
    act(() => { vi.advanceTimersByTime(20); });
    scroller.scrollTop = 0;
    act(() => { unmount(); });

    expect(savedScrollYs().at(-1)).toBe(1500);
  });
});
