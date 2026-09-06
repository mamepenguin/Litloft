import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { ArchivePreview } from "../ArchivePreview";
import { ShortcutsProvider } from "../ShortcutsProvider";

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = mockObserve;
    disconnect = mockDisconnect;
    unobserve = vi.fn();
    constructor(cb: IntersectionObserverCallback) {
      setTimeout(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver), 0);
    }
  }
);

vi.mock("../ViewToggle", () => ({
  ViewToggle: ({ onChange }: { onChange: (m: string) => void }) => (
    <button onClick={() => onChange("list")} data-testid="view-toggle" />
  ),
}));

function renderWithShortcuts(ui: ReactNode) {
  return render(<ShortcutsProvider>{ui}</ShortcutsProvider>);
}
import type { ArchiveContents } from "@/types";

const mockArchive: ArchiveContents = {
  entries: [
    {
      path: "chapter1/",
      filename: "chapter1",
      file_size: 0,
      compressed_size: 0,
      file_type: "other",
      mime_type: "",
      is_dir: true,
    },
    {
      path: "readme.txt",
      filename: "readme.txt",
      file_size: 256,
      compressed_size: 200,
      file_type: "document",
      mime_type: "text/plain",
      is_dir: false,
    },
    {
      path: "cover.jpg",
      filename: "cover.jpg",
      file_size: 102400,
      compressed_size: 98000,
      file_type: "image",
      mime_type: "image/jpeg",
      is_dir: false,
    },
    {
      path: "chapter1/001.jpg",
      filename: "001.jpg",
      file_size: 524288,
      compressed_size: 498000,
      file_type: "image",
      mime_type: "image/jpeg",
      is_dir: false,
    },
    {
      path: "chapter1/002.jpg",
      filename: "002.jpg",
      file_size: 512000,
      compressed_size: 490000,
      file_type: "image",
      mime_type: "image/jpeg",
      is_dir: false,
    },
    {
      // Opened by its extension, not by its mime: `classify` has no bucket
      // for Dart, so a ZIP entry named `main.dart` arrives here opaque.
      path: "main.dart",
      filename: "main.dart",
      file_size: 512,
      compressed_size: 400,
      file_type: "other",
      mime_type: "application/octet-stream",
      is_dir: false,
    },
    {
      // Over `MAX_TEXT_AUTO_LOAD`, so opening it must ask first.
      path: "huge.log",
      filename: "huge.log",
      file_size: 4 * 1024 * 1024,
      compressed_size: 900000,
      file_type: "document",
      mime_type: "text/plain",
      is_dir: false,
    },
    {
      path: "data.bin",
      filename: "data.bin",
      file_size: 1024,
      compressed_size: 900,
      file_type: "other",
      mime_type: "application/octet-stream",
      is_dir: false,
    },
  ],
  total_entries: 8,
  total_size: 1140000,
};

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/api", () => ({
  getArchiveContents: vi.fn(),
  getArchiveEntryUrl: vi.fn(
    (id: string, path: string) => `/api/files/${id}/archive/entry?path=${encodeURIComponent(path)}`
  ),
  getDownloadUrl: vi.fn(
    (id: string) => `/api/files/${id}/stream?download=true`
  ),
}));

import { getArchiveContents } from "@/lib/api";

const mockedGetArchiveContents = vi.mocked(getArchiveContents);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetArchiveContents.mockResolvedValue(mockArchive);
  mockSearchParams.delete("archivePath");
  localStorage.clear();
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  localStorage.clear();
  // Restored by hand, not with `vi.unstubAllGlobals()`: the
  // `IntersectionObserver` stub above is installed once at module scope, and
  // unstubbing everything takes it away with the fetch — after which every
  // later render of a grid cell throws and the failure lands somewhere else
  // entirely. Only visible under `--sequence.shuffle`.
  globalThis.fetch = originalFetch;
});

describe("ArchivePreview", () => {
  it("renders file listing after loading archive contents", async () => {
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("chapter1")).toBeInTheDocument();
    });

    expect(screen.getByText("readme.txt")).toBeInTheDocument();
    expect(screen.getByText("cover.jpg")).toBeInTheDocument();
    expect(screen.getByText("data.bin")).toBeInTheDocument();
    // Files in subdirectory should not appear at root
    expect(screen.queryByText("001.jpg")).not.toBeInTheDocument();
  });

  it("shows directories with folder styling", async () => {
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("chapter1")).toBeInTheDocument();
    });

    // The directory entry should be a button
    const dirButton = screen.getByText("chapter1").closest("button");
    expect(dirButton).toBeTruthy();
    expect(dirButton).not.toBeDisabled();
  });

  it("clicking directory navigates deeper", async () => {
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("chapter1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("chapter1"));

    // Should navigate via router.push with archivePath param
    expect(mockPush).toHaveBeenCalledWith("?archivePath=chapter1");
  });

  it("breadcrumb navigation works", async () => {
    // Simulate being inside chapter1
    mockSearchParams.set("archivePath", "chapter1");
    render(<ArchivePreview fileId="test-id" />);

    // Breadcrumb should show Archive > chapter1
    expect(await screen.findByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("chapter1")).toBeInTheDocument();
    // This level is nothing but pages, so the grid stops repeating
    // their names under the thumbnails — see ArchiveEntryGrid.
    expect(screen.queryByText("001.jpg")).toBeNull();
    // Click "Archive" to go back to root
    fireEvent.click(screen.getByText("Archive"));

    // Should navigate to root (no query params, uses pathname)
    expect(mockPush).toHaveBeenCalledWith(window.location.pathname);
  });

  it("clicking image entry opens fullscreen viewer", async () => {
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("cover.jpg")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("cover.jpg"));

    await waitFor(() => {
      expect(screen.getByAltText("cover.jpg")).toBeInTheDocument();
    });

    // Should show counter
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("escape key closes fullscreen viewer", async () => {
    renderWithShortcuts(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("cover.jpg")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("cover.jpg"));

    await waitFor(() => {
      expect(screen.getByAltText("cover.jpg")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      // Should be back to listing
      expect(screen.getByText("readme.txt")).toBeInTheDocument();
      expect(screen.queryByAltText("cover.jpg")).not.toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    mockedGetArchiveContents.mockRejectedValue(new Error("Not found"));

    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load archive/)
      ).toBeInTheDocument();
    });
  });

  // D-14, and the reason it is a regression test rather than a fix note: the
  // text viewer used to be the file listing's `children`, so pressing a text
  // entry in the grid set `viewerMode` to "text" and drew nothing at all. The
  // press looked like it had missed.
  it("opens the text viewer from the grid, not only from the listing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "hello from the zip" }) as unknown as typeof fetch;
    // The root level derives a list (one image among three files), so the
    // grid is reached the way a reader reaches it: by choosing it.
    localStorage.setItem(
      "archive-view-choices",
      JSON.stringify([{ id: "test-id", mode: "grid" }])
    );
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("readme.txt")).toBeInTheDocument();
    });
    // The precondition, asserted rather than assumed: this test reaches the
    // grid through `useArchiveViewMode`'s storage, and a change to that key
    // or its shape would silently turn it into a second copy of the listing
    // test below — leaving D-14 uncovered with the suite green. The listing
    // renders a `<ul role="list">`; the grid does not.
    expect(screen.queryByRole("list")).toBeNull();

    fireEvent.click(screen.getByText("readme.txt"));

    expect(await screen.findByTestId("text-viewer")).toBeInTheDocument();
    expect(await screen.findByText("hello from the zip")).toBeInTheDocument();
  });

  it("asks before fetching a text entry over 1 MB", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("huge.log")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("huge.log"));

    // The gate lives in `handleFileClick`, not in the viewer, so the viewer's
    // own tests — which take `textConfirmed` as a prop — never reach it.
    expect(await screen.findByText("Load")).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("opens it from the listing too", async () => {
    // The assertion above is only interesting if the listing still works —
    // moving the viewer out of the listing is what could have broken it.
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "hello from the zip" }) as unknown as typeof fetch;
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("readme.txt")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("readme.txt"));

    expect(await screen.findByTestId("text-viewer")).toBeInTheDocument();
  });

  it("offers a download when the text cannot be fetched", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" }) as unknown as typeof fetch;
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("readme.txt")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("readme.txt"));

    // Not a bare red sentence: the entry turned out not to be openable, and
    // the download is the way out of that.
    await screen.findByText("This file could not be opened");
    // Named exactly "Download": the viewer's own header link is named
    // "Download readme.txt", so this picks out the empty state's action
    // rather than either one that happens to be on screen.
    const link = screen.getByRole("link", { name: "Download" });
    // `EmptyState`'s action carries `download` as a flag, so the name comes
    // from the URL rather than the attribute.
    expect(link.hasAttribute("download")).toBe(true);
    expect(link.getAttribute("href")).toContain("readme.txt");
  });

  it("opens a source file the mime table has no name for", async () => {
    // ARC-1. `isTextPreviewable` reads the entry's name here because the mime
    // is `application/octet-stream` — the same value `data.bin` carries, so
    // the mime alone cannot tell the two apart.
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "void main() {}" }) as unknown as typeof fetch;
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("main.dart")).toBeInTheDocument();
    });
    const row = screen.getByText("main.dart").closest("li")!;
    expect(within(row).queryByText("No preview")).toBeNull();

    fireEvent.click(screen.getByText("main.dart"));
    expect(await screen.findByText("void main() {}")).toBeInTheDocument();
  });

  it("non-previewable files are not controls, and are given a way out", async () => {
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("data.bin")).toBeInTheDocument();
    });

    const row = screen.getByText("data.bin").closest("li")!;
    expect(row.querySelector("button")).toBeNull();
    expect(within(row).getByText("No preview")).toBeInTheDocument();
    expect(within(row).getByRole("link").getAttribute("download")).toBe(
      "data.bin"
    );
  });
});

describe("ArchivePreview — the index's press", () => {
  it("publishes the whole archive and the level to the inspector", async () => {
    // The controller is handed over once and updated in place — the
    // inspector subscribes, it is not re-mounted per level. So what is
    // asserted is the state it holds once the archive has loaded, not
    // what it held at the moment it was handed over.
    const published: Array<import("@/lib/archiveController").ArchiveController> =
      [];
    renderWithShortcuts(
      <ArchivePreview
        fileId="file-1"
        onArchiveController={(c) => {
          if (c) published.push(c);
        }}
      />,
    );
    await screen.findByText("cover.jpg");
    expect(published).toHaveLength(1);
    const state = published[0].getState();
    // Every entry at every depth, not the level the canvas is on.
    expect(state.entries).toHaveLength(8);
    expect(state.currentPath).toBe("");
  });

  it("descends into a directory the index hands it", async () => {
    let controller: import("@/lib/archiveController").ArchiveController | null =
      null;
    renderWithShortcuts(
      <ArchivePreview
        fileId="file-1"
        onArchiveController={(c) => {
          controller = c;
        }}
      />,
    );
    await screen.findByText("cover.jpg");
    mockPush.mockClear();

    const dir = controller!
      .getState()
      .entries.find((e) => e.path === "chapter1/")!;
    controller!.open(dir);

    expect(mockPush).toHaveBeenCalledWith("?archivePath=chapter1");
  });

  it("moves to the level first for a leaf that is not on this one", async () => {
    // `handleFileClick` reads the *current* level's image list, so
    // calling it before the move lands would open the wrong page or
    // none. The URL write is the observable half of that ordering.
    let controller: import("@/lib/archiveController").ArchiveController | null =
      null;
    renderWithShortcuts(
      <ArchivePreview
        fileId="file-1"
        onArchiveController={(c) => {
          controller = c;
        }}
      />,
    );
    await screen.findByText("cover.jpg");
    mockPush.mockClear();

    const deep = controller!
      .getState()
      .entries.find((e) => e.path === "chapter1/002.jpg")!;
    controller!.open(deep);

    expect(mockPush).toHaveBeenCalledWith("?archivePath=chapter1");
  });

  it("opens a leaf on this level without moving anywhere", async () => {
    let controller: import("@/lib/archiveController").ArchiveController | null =
      null;
    renderWithShortcuts(
      <ArchivePreview
        fileId="file-1"
        onArchiveController={(c) => {
          controller = c;
        }}
      />,
    );
    await screen.findByText("cover.jpg");
    mockPush.mockClear();

    const here = controller!
      .getState()
      .entries.find((e) => e.path === "readme.txt")!;
    controller!.open(here);

    expect(mockPush).not.toHaveBeenCalled();
    // The text viewer is what "open" means for a `.txt`.
    await screen.findByTestId("text-viewer");
  });
});
