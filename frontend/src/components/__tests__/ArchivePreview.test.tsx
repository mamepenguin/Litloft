import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { ArchivePreview } from "../ArchivePreview";
import { ShortcutsProvider } from "../ShortcutsProvider";

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
      path: "data.bin",
      filename: "data.bin",
      file_size: 1024,
      compressed_size: 900,
      file_type: "other",
      mime_type: "application/octet-stream",
      is_dir: false,
    },
  ],
  total_entries: 6,
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
  // Reset search params
  mockSearchParams.delete("archivePath");
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

    await waitFor(() => {
      expect(screen.getByText("001.jpg")).toBeInTheDocument();
    });

    // Breadcrumb should show Archive > chapter1
    expect(screen.getByText("Archive")).toBeInTheDocument();
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

  it("non-previewable files are disabled", async () => {
    render(<ArchivePreview fileId="test-id" />);

    await waitFor(() => {
      expect(screen.getByText("data.bin")).toBeInTheDocument();
    });

    const binButton = screen.getByText("data.bin").closest("button");
    expect(binButton).toBeDisabled();
  });
});
