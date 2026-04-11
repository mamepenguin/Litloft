import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
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

import { FileCard } from "../FileCard";
import type { FileItem } from "@/types";

const mockFile: FileItem = {
  id: "abc123def456",
  filename: "test.mp4",
  title: "Test Video",
  description: "",
  drive: "test-drive",
  folder_path: "旅行",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "/api/files/abc123def456/thumbnail",
  file_size: 1048576,
  duration: 125.5,
  likes: 3,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  created_at: "2026-03-20T10:00:00",
  updated_at: "2026-03-20T10:00:00",
};

describe("FileCard", () => {
  it("renders title", () => {
    render(<FileCard file={mockFile} />);
    expect(screen.getByText("Test Video")).toBeInTheDocument();
  });

  it("renders file size and relative date", () => {
    render(<FileCard file={mockFile} />);
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
  });

  it("renders formatted duration for video", () => {
    render(<FileCard file={mockFile} />);
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("links to file page", () => {
    render(<FileCard file={mockFile} />);
    const links = screen.getAllByRole("link");
    const fileLink = links.find((l) => l.getAttribute("href") === "/files/abc123def456");
    expect(fileLink).toBeTruthy();
  });

  it("renders thumbnail image for video", () => {
    render(<FileCard file={mockFile} />);
    const img = screen.getByAltText("Test Video");
    expect(img).toHaveAttribute("src", "/api/files/abc123def456/thumbnail");
  });

  it("does not show duration for non-media files", () => {
    render(<FileCard file={{ ...mockFile, file_type: "document", duration: null }} />);
    expect(screen.queryByText("2:05")).toBeNull();
  });

  it("shows file type icon for non-video files", () => {
    render(<FileCard file={{ ...mockFile, file_type: "document", mime_type: "application/pdf" }} />);
    expect(screen.queryByAltText("Test Video")).toBeNull();
  });

  describe("VideoPreview", () => {
    it("renders preview container for video files", () => {
      render(<FileCard file={mockFile} />);
      expect(screen.getByTestId("video-preview-container")).toBeInTheDocument();
    });

    it("does not show preview overlay for image files", () => {
      render(
        <FileCard
          file={{ ...mockFile, file_type: "image", mime_type: "image/jpeg", filename: "photo.jpg" }}
        />
      );
      expect(screen.queryByTestId("video-preview-container")).toBeNull();
    });

    it("does not show preview overlay for audio files", () => {
      render(
        <FileCard
          file={{ ...mockFile, file_type: "audio", mime_type: "audio/mpeg", filename: "song.mp3" }}
        />
      );
      expect(screen.queryByTestId("video-preview-container")).toBeNull();
    });

    it("does not show preview overlay for document files", () => {
      render(
        <FileCard
          file={{ ...mockFile, file_type: "document", mime_type: "application/pdf", filename: "doc.pdf" }}
        />
      );
      expect(screen.queryByTestId("video-preview-container")).toBeNull();
    });
  });
});
