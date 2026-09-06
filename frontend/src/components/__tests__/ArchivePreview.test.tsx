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
      path: "data.bin",
      filename: "data.bin",
      file_size: 1024,
      compressed_size: 900,
      file_type: "other",
      mime_type: "application/octet-stream",
      is_dir: false,
    },
  ],
  total_entries: 7,
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

afterEach(() => {
  localStorage.clear();
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "hello from the zip" })
    );
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
    fireEvent.click(screen.getByText("readme.txt"));

    expect(await screen.findByTestId("text-viewer")).toBeInTheDocument();
    expect(await screen.findByText("hello from the zip")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("opens it from the listing too", async () => {
    // The assertion above is only interesting if the listing still works —
    // moving the viewer out of the listing is what could have broken it.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "hello from the zip" })
    );
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("readme.txt")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("readme.txt"));

    expect(await screen.findByTestId("text-viewer")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("offers a download when the text cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" }));
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("readme.txt")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("readme.txt"));

    // Not a bare red sentence: the entry turned out not to be openable, and
    // the download is the way out of that.
    const failure = await screen.findByText("This file could not be opened");
    const link = within(failure.closest("div")!.parentElement!).getByRole("link");
    // `EmptyState`'s action carries `download` as a flag, so the name comes
    // from the URL rather than the attribute.
    expect(link.hasAttribute("download")).toBe(true);
    expect(link.getAttribute("href")).toContain("readme.txt");
    expect(link.textContent).toBe("Download");
    vi.unstubAllGlobals();
  });

  it("opens a source file the mime table has no name for", async () => {
    // ARC-1. `isTextPreviewable` reads the entry's name here because the mime
    // is `application/octet-stream` — the same value `data.bin` carries, so
    // the mime alone cannot tell the two apart.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "void main() {}" })
    );
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("main.dart")).toBeInTheDocument();
    });
    const row = screen.getByText("main.dart").closest("li")!;
    expect(within(row).queryByText("No preview")).toBeNull();

    fireEvent.click(screen.getByText("main.dart"));
    expect(await screen.findByText("void main() {}")).toBeInTheDocument();
    vi.unstubAllGlobals();
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
